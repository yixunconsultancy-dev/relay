#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-relationshiposdemo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROFILE_DIR="${HOME}/.hermes/profiles/${PROFILE}"

if ! command -v hermes >/dev/null 2>&1; then
  echo "Hermes is not installed or not on PATH." >&2
  exit 1
fi

if hermes profile show "${PROFILE}" >/dev/null 2>&1; then
  echo "Using existing Hermes profile: ${PROFILE}"
else
  hermes profile create "${PROFILE}" --no-skills --no-alias
fi

mkdir -p "${PROFILE_DIR}"
cp "${KIT_DIR}/SOUL.md" "${PROFILE_DIR}/SOUL.md"
cp "${KIT_DIR}/DATA_SCHEMA.md" "${PROFILE_DIR}/DATA_SCHEMA.md"
cp "${KIT_DIR}/REMINDER_RULES.md" "${PROFILE_DIR}/REMINDER_RULES.md"
cp "${KIT_DIR}/RELATIONSHIP_RULES.md" "${PROFILE_DIR}/RELATIONSHIP_RULES.md"
cp "${KIT_DIR}/PRIVACY_AND_BOUNDARIES.md" "${PROFILE_DIR}/PRIVACY_AND_BOUNDARIES.md"

if [[ -f "${KIT_DIR}/.env" ]]; then
  cp "${KIT_DIR}/.env" "${PROFILE_DIR}/.env"
elif [[ ! -f "${PROFILE_DIR}/.env" ]]; then
  cp "${KIT_DIR}/.env.example" "${PROFILE_DIR}/.env"
fi

touch "${PROFILE_DIR}/.env"

set_env_value() {
  local key="$1"
  local value="$2"
  local file="${PROFILE_DIR}/.env"
  local tmp="${file}.tmp"
  local formatted_value

  if [[ "${value}" == *[[:space:]]* ]]; then
    formatted_value="\"${value//\"/\\\"}\""
  else
    formatted_value="${value}"
  fi

  if grep -q "^${key}=" "${file}"; then
    awk -v k="${key}" -v v="${formatted_value}" '
      BEGIN { done = 0 }
      $0 ~ "^" k "=" { print k "=" v; done = 1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "${file}" > "${tmp}"
    mv "${tmp}" "${file}"
  else
    printf '%s=%s\n' "${key}" "${formatted_value}" >> "${file}"
  fi
}

set_env_value "RELATIONSHIP_OS_KIT_DIR" "${KIT_DIR}"
set_env_value "RELATIONSHIP_OS_DB_PATH" "${KIT_DIR}/data/relationship_os.sqlite3"
set_env_value "RELATIONSHIP_OS_LOCAL_DIR" "${KIT_DIR}/data/local_sheet"

for key in TELEGRAM_BOT_TOKEN AUTHORIZED_USER_ID GOOGLE_SHEET_ID GOOGLE_SERVICE_ACCOUNT_EMAIL CONSULTANT_NAME; do
  if grep -q "^${key}=your_" "${PROFILE_DIR}/.env"; then
    set_env_value "${key}" ""
  fi
done

if grep -q '^CONSULTANT_NAME=Your Name$' "${PROFILE_DIR}/.env"; then
  set_env_value "CONSULTANT_NAME" ""
fi

set_env_value "RELATIONSHIP_OS_STORE" "sqlite"

if ! grep -q '^RELATIONSHIP_OS_CONSULTANT_VIEW=' "${PROFILE_DIR}/.env"; then
  printf 'RELATIONSHIP_OS_CONSULTANT_VIEW=csv\n' >> "${PROFILE_DIR}/.env"
fi

LIMITED_TOOLSETS=(
  web
  browser
  file
  code_execution
  vision
  image_gen
  tts
  skills
  todo
  memory
  session_search
  clarify
  delegation
  cronjob
  messaging
)

for platform in cli telegram; do
  hermes -p "${PROFILE}" tools disable --platform "${platform}" "${LIMITED_TOOLSETS[@]}" >/dev/null
  hermes -p "${PROFILE}" tools enable --platform "${platform}" terminal >/dev/null
done

python3 "${KIT_DIR}/scripts/relationship_os.py" --env "${PROFILE_DIR}/.env" init >/dev/null

cat <<EOF
Relationship OS Hermes profile is ready.

Profile: ${PROFILE}
Profile home: ${PROFILE_DIR}
Kit: ${KIT_DIR}

Next steps:
1. Put the consultant's TELEGRAM_BOT_TOKEN in ${PROFILE_DIR}/.env
2. Run: hermes -p ${PROFILE} gateway setup
3. Run: hermes -p ${PROFILE} gateway run --replace
4. Optional: python3 "${KIT_DIR}/scripts/clear_telegram_commands.py" "${PROFILE_DIR}/.env"
5. Send status to the new Telegram bot

For the local CSV consultant-facing view, inspect:
${KIT_DIR}/data/local_sheet

The agent's structured source of truth is:
${KIT_DIR}/data/relationship_os.sqlite3
EOF
