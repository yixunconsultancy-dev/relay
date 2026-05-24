# Google Sheets Setup

Step-by-step guide to connecting Google Sheets as the consultant-facing view for
the Relationship OS Kit.

## Overview

The agent keeps its structured source of truth in SQLite. When Google Sheets is
selected as the consultant-facing view, the bot mirrors the SQLite records into
the consultant's Sheet.

The bot uses a **service account** to write your Google Sheet. A service
account is like a robot Google account - it authenticates with a key file, no
browser login required.

You create the Sheet, share it with the service account, and the bot handles the rest.

## Step 1: Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top, then **New Project**.
3. Name it (e.g. "Relationship Bot") and click **Create**.

## Step 2: Enable the Google Sheets API

1. In the left sidebar, go to **APIs & Services > Library**.
2. Search for "Google Sheets API".
3. Click on it, then click **ENABLE**.

## Step 3: Create a service account

1. Go to **IAM & Admin > Service Accounts**.
2. Click **Create Service Account**.
3. Fill in:
   - **Name:** `relationship-bot`
   - **Description:** "Service account for Relationship Bot"
4. Click **Create and Continue**.
5. Skip the optional role and user access steps — click **Done**.

## Step 4: Download the JSON key

1. Click on the service account you just created.
2. Go to the **Keys** tab.
3. Click **Add Key > Create new key**.
4. Select **JSON** and click **Create**.
5. A JSON file downloads. **Store it securely** — this is the bot's credential.

Move the file to your kit directory:

```bash
mkdir -p credentials
mv ~/Downloads/your-project-*.json credentials/service-account.json
```

Update `.env`:

```bash
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
```

**Important:** Add `credentials/` to `.gitignore`. Never commit the key file.

## Step 5: Create your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com/) and create a new spreadsheet.
2. Name it (e.g. "Relationship Tracker").
3. Create 5 tabs with these exact names:
   - `Contacts`
   - `Touchpoints`
   - `Reminders`
   - `Daily Focus`
   - `Settings`
4. Add column headers to each tab as defined in `DATA_SCHEMA.md`.

## Step 6: Share the Sheet with your service account

1. Open your Google Sheet.
2. Click **Share** (top right).
3. Paste the service account's email address — find it in the JSON key file under `client_email` (looks like `relationship-bot@your-project.iam.gserviceaccount.com`).
4. Set permission to **Editor**.
5. Uncheck "Notify people" (the service account has no inbox).
6. Click **Share**.

## Step 7: Get your Sheet ID

The Sheet ID is the long string in the URL between `/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                       This is your Sheet ID
```

Add it to `.env`:

```bash
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

Also add the service account email:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=relationship-bot@your-project.iam.gserviceaccount.com
```

## Step 8: Install Python dependencies

The Google Sheets view uses `gspread` and `google-auth`:

```bash
python3 -m pip install -r requirements.txt
```

If dependency installation fails because the machine cannot reach PyPI, connect
to the internet and rerun the command.

## Step 9: Switch the consultant-facing view to Google Sheets

In the Hermes profile env file, set:

```text
RELATIONSHIP_OS_STORE=sqlite
RELATIONSHIP_OS_CONSULTANT_VIEW=google
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
```

Then initialize the Sheet:

```bash
python3 scripts/relationship_os.py --env ~/.hermes/profiles/relationshiposdemo/.env init
python3 scripts/relationship_os.py --env ~/.hermes/profiles/relationshiposdemo/.env status
```

## Step 10: Verify the connection

Run the bot and send a test message via Telegram:

```
Had lunch with Sarah, second meeting, she's interested in protection planning.
```

Check your Google Sheet. You should see mirrored rows from the SQLite source of
truth:

- A new row in the **Contacts** tab for Sarah
- A touchpoint logged in the **Touchpoints** tab
- A follow-up reminder in the **Reminders** tab

## Underlying libraries

The v0 Google Sheets view uses Python `gspread`:

```python
import gspread
gc = gspread.service_account(filename='credentials/service-account.json')
sh = gc.open_by_key('YOUR_SHEET_ID')
```

## Rate limits

Google Sheets API allows 60 reads and 60 writes per minute per user. This is more than enough for a personal bot — even a very active consultant won't hit these limits through normal Telegram usage.

## Common issues

| Problem | Fix |
|---|---|
| 403 Permission denied | Service account email not added as Editor on the Sheet |
| Sheet not updating | Check `GOOGLE_SHEET_ID` matches the URL, verify tab names are exact |
| Credential file not found | Check `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in `.env` points to the right file |
| Wrong data in wrong tab | Tab names must exactly match: `Contacts`, `Touchpoints`, `Reminders`, `Daily Focus`, `Settings` |

See `TROUBLESHOOTING.md` for more detailed fixes.

## Next step

Once your Sheet is connected and the test message creates entries, the setup is complete. Read `SOUL.md` for the runtime rules and `README.md` for the v0 capability list.
