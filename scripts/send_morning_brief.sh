#!/usr/bin/env bash
# Morning brief sender — called by the launchd job at 9am SGT daily.
#
# Pipeline:
#   1. Run `today-brief --format=text` against the kit
#   2. POST the output to Telegram Bot API sendMessage
#   3. Log success/failure to ~/Library/Logs/awmos-morning-brief.log
#
# Required environment variables (sourced from $ENV_FILE if set, else
# $KIT_ROOT/.env):
#   TELEGRAM_BOT_TOKEN  — the bot token from BotFather
#   TELEGRAM_CHAT_ID    — the consultant's Telegram chat ID (numeric)
#
# Optional:
#   KIT_ROOT            — defaults to the script's parent directory
#   ENV_FILE            — defaults to $KIT_ROOT/.env

set -uo pipefail

LOG_DIR="$HOME/Library/Logs"
LOG_FILE="$LOG_DIR/awmos-morning-brief.log"
mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] $*" >> "$LOG_FILE"
}

# Resolve kit root: explicit env override, else the parent of this script.
KIT_ROOT="${KIT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$KIT_ROOT/.env}"

if [[ ! -d "$KIT_ROOT" ]]; then
  log "ERROR kit root not found at $KIT_ROOT"
  exit 1
fi

# Source env file if present. Don't hard-fail if missing — caller may have
# set the required vars in the launchd plist's EnvironmentVariables.
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required (set in $ENV_FILE or the launchd plist)}"
: "${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID is required (set in $ENV_FILE or the launchd plist)}"

# Locate python — launchd PATH is minimal, so prefer common Python managers
# (matches the same fallback the Tauri app uses in src-tauri/src/lib.rs).
PYTHON_BIN="${RELATIONSHIP_OS_PYTHON:-}"
if [[ -z "${PYTHON_BIN}" ]]; then
  for candidate in \
    "$HOME/.pyenv/shims/python3" \
    "$HOME/.asdf/shims/python3" \
    "/opt/homebrew/bin/python3" \
    "/usr/local/bin/python3" \
    "/usr/bin/python3"
  do
    if [[ -x "$candidate" ]]; then
      PYTHON_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "${PYTHON_BIN}" ]]; then
  log "ERROR no python3 found on PATH; set RELATIONSHIP_OS_PYTHON"
  exit 1
fi

log "INFO running today-brief via $PYTHON_BIN"
BRIEF_TEXT="$(cd "$KIT_ROOT" && "$PYTHON_BIN" scripts/relationship_os.py --env "$ENV_FILE" --format=text today-brief 2>>"$LOG_FILE")"
if [[ -z "$BRIEF_TEXT" ]]; then
  log "ERROR today-brief produced empty output; aborting send"
  exit 1
fi

# Telegram has a 4096-char limit per message. The brief is usually well
# under that, but truncate defensively with a footer if it grows.
MAX_LEN=4000
if [[ ${#BRIEF_TEXT} -gt $MAX_LEN ]]; then
  BRIEF_TEXT="${BRIEF_TEXT:0:$MAX_LEN}"$'\n\n…(brief truncated — see app for full detail)'
fi

# POST to Telegram. parse_mode=null because the brief is plain text;
# avoids accidental markdown parsing of dashes/asterisks.
RESPONSE="$(
  curl -sS \
    --max-time 30 \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${BRIEF_TEXT}" \
    --data-urlencode "disable_web_page_preview=true" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    2>>"$LOG_FILE"
)"

if [[ "$RESPONSE" == *'"ok":true'* ]]; then
  log "INFO morning brief delivered (${#BRIEF_TEXT} chars)"
  exit 0
else
  log "ERROR Telegram sendMessage failed. Response: ${RESPONSE:0:400}"
  exit 1
fi
