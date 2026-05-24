# Hermes Setup

The consultant's bot should run on a dedicated Hermes profile.

Do not use an existing personal assistant profile for Relationship OS testing.
Each consultant gets a separate Telegram bot, Hermes profile, SQLite database,
consultant-facing view, and `.env` file.

## Create The Profile

From this folder:

```bash
bash scripts/bootstrap_hermes_profile.sh relationshiposdemo
```

The script:

- Creates the Hermes profile if needed
- Copies `SOUL.md` into the profile
- Copies the Relationship OS rules into the profile
- Limits CLI and Telegram to the `terminal` tool so Hermes can call the helper
  script without exposing unrelated skill, web, memory, or messaging tools
- Initializes the SQLite source of truth and default local CSV view

## Test From CLI

If this is a brand-new Hermes profile, configure its model provider first:

```bash
hermes -p relationshiposdemo setup
```

Then test:

```bash
hermes -p relationshiposdemo -z "status"
hermes -p relationshiposdemo -z "Had coffee with Demo Client today. Interested in retirement planning. Follow up next Friday."
hermes -p relationshiposdemo -z "prep Demo Client"
hermes -p relationshiposdemo -z "export-md"
hermes -p relationshiposdemo -z "appointment-summary Demo Client"
```

If these commands update `data/relationship_os.sqlite3` and mirror rows into
`data/local_sheet/`, the Hermes profile is ready for Telegram testing. Markdown
notes and generated drafts are written under the configured
`RELATIONSHIP_OS_VAULT_DIR`.

## Connect Telegram

Create a new Telegram bot using [TELEGRAM_BOT_SETUP.md](./TELEGRAM_BOT_SETUP.md).

Add the bot token to:

```text
~/.hermes/profiles/relationshiposdemo/.env
```

Then run:

```bash
hermes -p relationshiposdemo gateway setup
hermes -p relationshiposdemo gateway run --replace
```

In another terminal, clear Hermes' default Telegram slash-command menu for the
test bot:

```bash
python3 scripts/clear_telegram_commands.py ~/.hermes/profiles/relationshiposdemo/.env
```

Send `status` to the new Telegram bot.

## Switch To Google Sheets

SQLite is the default source of truth:

```text
RELATIONSHIP_OS_STORE=sqlite
RELATIONSHIP_OS_DB_PATH=./data/relationship_os.sqlite3
```

The consultant-facing view is configured separately. For Google Sheets, after
Google credentials are ready, set:

```text
RELATIONSHIP_OS_CONSULTANT_VIEW=google
GOOGLE_SHEET_ID=...
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
```

Install dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Initialize the Sheet:

```bash
python3 scripts/relationship_os.py --env ~/.hermes/profiles/relationshiposdemo/.env init
```
