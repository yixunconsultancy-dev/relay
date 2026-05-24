# Consultant POV Test Plan

Use this to test the kit exactly like a new consultant starting fresh on a
local desktop.

## Goal

Prove the v0 loop:

```text
Telegram note -> Hermes agent -> Relationship OS helper -> SQLite -> consultant view
```

For the first test, use SQLite with the local CSV consultant-facing view. For
the live test, switch the consultant-facing view to Google Sheets after
credentials are ready.

## Clean Test Setup

Use a separate sandbox from any existing personal Hermes assistant.

Recommended names:

- Telegram bot: `AWM Relationship Demo Bot`
- Hermes profile: `relationshiposdemo`
- Google Sheet: `Relationship OS Demo - Consultant POV`

## Local Dry Run

From this kit folder:

```bash
python3 scripts/relationship_os.py --env .env.example demo --reset
python3 scripts/relationship_os.py --env .env.example status
python3 scripts/relationship_os.py --env .env.example prep --name "Demo Client"
python3 scripts/relationship_os.py --env .env.example today
```

Expected result:

- `data/relationship_os.sqlite3` contains the source-of-truth rows.
- `data/local_sheet/Contacts.csv` contains Demo Client, Sarah Lim, and Jason Wong.
- `data/local_sheet/Touchpoints.csv` contains three logged interactions.
- `data/local_sheet/Reminders.csv` contains three pending reminders.

## Hermes Profile Dry Run

Create an isolated Hermes profile:

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

Expected result:

- Hermes calls the helper script.
- The SQLite database updates.
- The local sheet CSV files mirror the same rows.
- Responses are consultant-facing, not developer-facing.

If Hermes says no inference provider is configured, complete
`hermes -p relationshiposdemo setup` before retrying.

## Live Telegram Test

1. Create a new bot with BotFather.
2. Put its token in the profile env file:

   ```text
   ~/.hermes/profiles/relationshiposdemo/.env
   ```

3. Run:

   ```bash
   hermes -p relationshiposdemo gateway setup
   hermes -p relationshiposdemo gateway run --replace
   ```

4. In another terminal, clear the default Hermes slash-command menu:

   ```bash
   python3 scripts/clear_telegram_commands.py ~/.hermes/profiles/relationshiposdemo/.env
   ```

5. In Telegram, send:

   ```text
   status
   ```

6. Then send:

   ```text
   Had coffee with Demo Client today. He is interested in retirement planning. Follow up next Friday.
   ```

Expected result:

- The bot confirms that it logged the touchpoint.
- The SQLite source of truth updates.
- The local CSV consultant-facing view updates.
- No data is mixed with the existing personal Hermes assistant.

## Google Sheets Test

After the local and Telegram dry runs work:

1. Create a new Google Sheet.
2. Create a service account key.
3. Share the Sheet with the service account email as Editor.
4. Install Python dependencies:

   ```bash
   python3 -m pip install -r requirements.txt
   ```

5. Update the profile env file:

   ```text
   RELATIONSHIP_OS_STORE=sqlite
   RELATIONSHIP_OS_CONSULTANT_VIEW=google
   GOOGLE_SHEET_ID=...
   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
   ```

6. Run:

   ```bash
   python3 scripts/relationship_os.py --env ~/.hermes/profiles/relationshiposdemo/.env init
   python3 scripts/relationship_os.py --env ~/.hermes/profiles/relationshiposdemo/.env status
   ```

Expected result:

- The Google Sheet has the five v0 tabs.
- Each tab has the expected headers.
- Telegram notes write into SQLite and mirror into the Google Sheet.
