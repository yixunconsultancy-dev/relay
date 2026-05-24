#!/usr/bin/env bash
# Install the morning brief launchd agent.
#
# Idempotent: re-running replaces the previous version cleanly. Safe to
# call from Hermes init or by hand.
#
# Prereqs (the script verifies):
#   - $KIT_ROOT/.env (or $ENV_FILE) contains TELEGRAM_BOT_TOKEN and
#     TELEGRAM_CHAT_ID
#   - scripts/send_morning_brief.sh exists and is executable
#   - scripts/launchd/com.awm.relationshipos.morning-brief.plist exists
#
# After install, runs a one-shot test send so you know the wiring works
# (set SKIP_TEST=1 to skip).

set -euo pipefail

KIT_ROOT="${KIT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$KIT_ROOT/.env}"
LABEL="com.awm.relationshipos.morning-brief"
TEMPLATE="$KIT_ROOT/scripts/launchd/${LABEL}.plist"
TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"

echo "Installing AWMOS morning brief launchd agent"
echo "  kit root: $KIT_ROOT"
echo "  env file: $ENV_FILE"
echo "  target:   $TARGET"
echo ""

# Verify prereqs.
if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: template not found at $TEMPLATE" >&2
  exit 1
fi
if [[ ! -x "$KIT_ROOT/scripts/send_morning_brief.sh" ]]; then
  echo "ERROR: $KIT_ROOT/scripts/send_morning_brief.sh missing or not executable" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file $ENV_FILE not found." >&2
  echo "       Create it with at minimum:" >&2
  echo "         TELEGRAM_BOT_TOKEN=123:abc..." >&2
  echo "         TELEGRAM_CHAT_ID=99999999" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN missing from $ENV_FILE" >&2
  exit 1
fi
if [[ -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "ERROR: TELEGRAM_CHAT_ID missing from $ENV_FILE" >&2
  exit 1
fi

# Render the template (substitute __KIT_ROOT__ and __HOME__).
mkdir -p "$(dirname "$TARGET")"
sed \
  -e "s|__KIT_ROOT__|$KIT_ROOT|g" \
  -e "s|__HOME__|$HOME|g" \
  "$TEMPLATE" > "$TARGET"
echo "Wrote $TARGET"

# Bootstrap (or rebootstrap) the agent in the user GUI domain.
USER_ID=$(id -u)
if launchctl print "gui/${USER_ID}/${LABEL}" >/dev/null 2>&1; then
  echo "Unloading existing agent..."
  launchctl bootout "gui/${USER_ID}/${LABEL}" || true
fi
echo "Loading agent..."
launchctl bootstrap "gui/${USER_ID}" "$TARGET"
launchctl enable "gui/${USER_ID}/${LABEL}"
echo "Agent installed."

# Optional one-shot smoke test.
if [[ "${SKIP_TEST:-0}" != "1" ]]; then
  echo ""
  echo "Sending a test brief now (set SKIP_TEST=1 to skip)..."
  if ENV_FILE="$ENV_FILE" KIT_ROOT="$KIT_ROOT" bash "$KIT_ROOT/scripts/send_morning_brief.sh"; then
    echo "Test brief sent. Check your Telegram chat."
  else
    echo "Test brief FAILED. See ~/Library/Logs/awmos-morning-brief.log for details." >&2
    exit 1
  fi
fi

echo ""
echo "Done. The brief will fire daily at 9:00 local time."
echo ""
echo "Useful commands:"
echo "  Trigger a brief now:    bash $KIT_ROOT/scripts/send_morning_brief.sh"
echo "  Check it's loaded:      launchctl print gui/\$(id -u)/${LABEL}"
echo "  Pause (e.g. vacation):  launchctl bootout gui/\$(id -u)/${LABEL}"
echo "  Resume:                 launchctl bootstrap gui/\$(id -u) $TARGET"
echo "  Logs:                   tail -f ~/Library/Logs/awmos-morning-brief.log"
