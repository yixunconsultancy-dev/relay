# Troubleshooting

Common issues and fixes for the AWM Relationship Bot Kit.

## Telegram Bot

### Bot doesn't respond to messages

1. Check the bot token in `.env` matches what BotFather gave you
2. Verify the bot is running: send `/start` to it in Telegram
3. Check that the agent/Hermes session is active
4. If using webhooks, verify the webhook URL is reachable
5. Make sure you are using the Relationship OS test bot, not your existing personal Hermes bot

### Bot responds but doesn't extract the right fields

1. Check that `SOUL.md` is loaded as the agent's instruction. The
   "Touchpoint Extraction" section defines the schema Hermes must produce.
2. Send a simple test message: "Had coffee with Sarah today"
3. If extraction fails, check the agent's error output. The helper script
   validates enums and dates and prints `Error: <field> must be ...` with
   the field name and the offending value.
4. Common failure modes: missing required field, an enum value Hermes
   invented that is not in the schema, or a non-ISO date in `touch_date`
   or `reminder_due`. Re-read the schema in SOUL.md and try again.

### "Bot not found" in Telegram

- Make sure you're messaging the correct bot username (the one you created with BotFather)
- BotFather tokens expire if you regenerate them — use the latest one

## Google Sheets

### "Permission denied" or "403" errors

1. Verify the service account email has Editor access to your Sheet
2. Check that `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in `.env` points to the correct JSON file
3. Confirm the Google Sheets API is enabled in your Google Cloud project

### Sheet not updating

1. Check `RELATIONSHIP_OS_STORE=sqlite` in the Hermes profile `.env`
2. Check `RELATIONSHIP_OS_CONSULTANT_VIEW=google` in the Hermes profile `.env`
2. Check `GOOGLE_SHEET_ID` in `.env` — it's the long string in the Sheet URL between `/d/` and `/edit`
2. Verify tab names match exactly: `Contacts`, `Touchpoints`, `Reminders`, `Daily Focus`, `Settings`
3. Check the service account has write access (Editor, not Viewer)

### SQLite or local CSV view not updating

1. Run `python3 scripts/relationship_os.py --env .env.example status`
2. Check `RELATIONSHIP_OS_DB_PATH` in the env file
2. Check `RELATIONSHIP_OS_LOCAL_DIR` in the env file
3. Check `RELATIONSHIP_OS_CONSULTANT_VIEW=csv` if you expect CSV files to update
4. Confirm Hermes was bootstrapped with `bash scripts/bootstrap_hermes_profile.sh relationshiposdemo`
4. In Telegram, send `status` and verify it reports the same store location

### Wrong Sheet tabs

The Google Sheets view expects exactly 5 tabs with these exact names. If you
renamed them or they're missing, create them manually with the columns from
`DATA_SCHEMA.md`.

## Data Issues

### Duplicate contacts

The bot uses fuzzy name matching. If duplicates appear:

1. Merge them manually in SQLite or the generated view (keep the one with more data)
2. Update any Touchpoints/Reminders that reference the old contact ID
3. The bot will match the surviving record going forward

### Missing reminders

Reminders are created when Hermes includes a `reminder_due` field in the
`log-touchpoint` payload. If a follow-up was mentioned in the consultant's
message but no reminder appeared:

1. Check the Reminders tab for a similar pending entry.
2. The cause is almost always that Hermes did not extract `reminder_due`
   from the message. Look at the touchpoint's `action_items` field — if the
   action is there but no reminder was created, Hermes saw the action but
   did not convert it to a date.
3. Re-send the message with a clearer follow-up phrase, or remind Hermes
   that any "follow up X" phrase should set `reminder_due` to the resolved
   absolute date.

### Dates look wrong

- Check `timezone` in the Settings table/view (default: `Asia/Singapore`).
- Hermes resolves relative dates ("next Tuesday", "tomorrow") to absolute
  ISO dates before calling the helper. If the agent's clock or timezone is
  wrong, dates will be off. The helper validates that the date is well-
  formed but does not second-guess the value.

## Agent / AI Issues

### Agent runs out of context

For long conversations, the agent may lose track of older messages. Start a fresh session periodically and re-load `SOUL.md`.

### Agent makes up data

If the agent invents contacts or touchpoints not in SQLite or the generated view, it's hallucinating. Check:

1. The agent is using `SOUL.md`
2. The helper command succeeds when run directly
3. The SQLite database or generated view isn't empty — run setup first
3. Restart the agent session

### Agent tries to send messages to clients

This violates the rules in `PRIVACY_AND_BOUNDARIES.md`. If the agent suggests sending a message to a client, remind it: "You do not send messages to clients. You only capture and track."

## Setup Issues

### `.env` file not found

- Copy `.env.example` to `.env`: `cp .env.example .env`
- Fill in all values before running

### Google Cloud project setup fails

- You need a Google account with access to Google Cloud Console
- Enable the Google Sheets API specifically (not just "Google Drive API")
- Create a service account, download the JSON key, and place it at the path in `.env`
