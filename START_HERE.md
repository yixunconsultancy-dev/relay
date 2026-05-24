# Start Here

This guide sets up a fresh Relationship OS test exactly like a new consultant
starting on a local desktop.

## What You Need

- Hermes installed locally
- Telegram account
- Google account, only when switching to the Google Sheets view
- About 20 minutes for local testing

## Setup With Your AI Agent (Recommended)

If you have Claude Code, the Codex CLI, or another AI coding agent installed
locally, the fastest way to set up this kit is to let your agent walk you
through it. From a terminal at this folder:

```bash
claude            # or: codex, or whichever agent you use
```

Then say to your agent:

> "Set up this Relationship OS kit for me. Read `SETUP.md` for the
> walkthrough order, prompt me for the values you need (Telegram bot
> token, consultant name, timezone, view choice), run the steps in order,
> and verify each one before moving to the next."

`SETUP.md` is written for the helper LLM and contains the exact order of
operations, the values to prompt for, the commands to run, and the
verification checks at each step. Your agent reads it and drives the
process while you handle the parts only a human can do (creating a
Telegram bot via BotFather, creating a Google service account if needed).

If you prefer to do it manually, follow the numbered steps below.

## Step 1: Run The Local Dry Run

From this folder:

```bash
python3 scripts/relationship_os.py --env .env.example demo --reset
python3 scripts/relationship_os.py --env .env.example status
```

The agent's structured source of truth is `data/relationship_os.sqlite3`. For
the default local consultant-facing view, open `data/local_sheet/` and check
that the CSV files contain demo contacts, touchpoints, and reminders.

Stop here until the local dry run works.

## Step 2: Create A Fresh Hermes Profile

Use a new profile so this test does not touch any existing Hermes assistant:

```bash
bash scripts/bootstrap_hermes_profile.sh relationshiposdemo
```

Then test the profile from CLI:

```bash
hermes -p relationshiposdemo setup
```

```bash
hermes -p relationshiposdemo -z "status"
hermes -p relationshiposdemo -z "Had coffee with Demo Client today. Interested in retirement planning. Follow up next Friday."
hermes -p relationshiposdemo -z "prep Demo Client"
```

Stop here until the Hermes profile can update the SQLite database and mirrored
local CSV view.

## Step 3: Create A New Telegram Bot

Follow [TELEGRAM_BOT_SETUP.md](./TELEGRAM_BOT_SETUP.md).

Use a new BotFather bot for this test. Do not reuse an existing personal Hermes
assistant bot.

## Step 4: Connect Telegram To The Hermes Profile

Put the new bot token in:

```text
~/.hermes/profiles/relationshiposdemo/.env
```

Then run:

```bash
hermes -p relationshiposdemo gateway setup
hermes -p relationshiposdemo gateway run --replace
```

In another terminal, clear the default Hermes slash-command menu for this test
bot:

```bash
python3 scripts/clear_telegram_commands.py ~/.hermes/profiles/relationshiposdemo/.env
```

Send `status` to the new Telegram bot.

## Step 5: Test Like A Consultant

Send:

```text
Had coffee with Demo Client today. He is interested in retirement planning. Follow up next Friday.
```

Expected result:

- Telegram replies with a short confirmation.
- `data/relationship_os.sqlite3` contains the structured source-of-truth rows.
- `data/local_sheet/Contacts.csv` includes Demo Client.
- `data/local_sheet/Touchpoints.csv` includes the original note.
- `data/local_sheet/Reminders.csv` includes a pending reminder.

## Step 6: Switch To Google Sheets

After the local and Telegram tests work, follow
[GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md) to create a real Sheet and
service account.

Then set:

```text
RELATIONSHIP_OS_STORE=sqlite
RELATIONSHIP_OS_CONSULTANT_VIEW=google
GOOGLE_SHEET_ID=...
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
```

Run:

```bash
python3 scripts/relationship_os.py --env ~/.hermes/profiles/relationshiposdemo/.env init
python3 scripts/relationship_os.py --env ~/.hermes/profiles/relationshiposdemo/.env status
```
