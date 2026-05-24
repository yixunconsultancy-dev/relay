# Setup Walkthrough (For The Helper AI Agent)

This file is written for an AI agent (Claude Code, Codex CLI, or similar)
that is helping a consultant set up the AWM Relationship OS kit. The
consultant is a non-technical financial consultant; you are doing the
typing, they are doing the clicking-around-in-Telegram-and-Google-Cloud
parts that only a human can do.

Your job is to walk them through the steps in the order below, prompt for
the values you need, run the commands, verify each step succeeded, and
explain anything that fails. Do not skip the verification checks — they
are how we catch silent setup mistakes.

## Phase 0: Orient

Before prompting the consultant for anything, read:

- `README.md` — what this kit is and is not.
- `START_HERE.md` — the human-facing setup outline.
- `PRIVACY_AND_BOUNDARIES.md` — what data the kit handles. Mention to the
  consultant that message text is processed by their configured Hermes
  model provider; they should not enter data their organization
  prohibits.

Confirm the consultant understands the kit is a private internal tool —
no client-facing messages, no financial recommendations, no broadcasts.

## Phase 1: Prompt For Values

Use AskUserQuestion (or your agent's equivalent) to collect these values
in a single prompt batch where possible. If you cannot batch, prompt in
this order:

1. **Consultant name.** Will appear in `.env` as `CONSULTANT_NAME` and in
   the Settings table.
2. **Timezone.** ISO timezone string. Default: `Asia/Singapore`. Common
   alternatives: `Asia/Hong_Kong`, `Asia/Tokyo`, `Europe/London`,
   `America/New_York`. Used to resolve "today", "next Friday", etc.
3. **Consultant-facing view.** One of:
   - `csv` — local CSV files under `data/local_sheet/`. Simplest. Default.
   - `obsidian` — Markdown vault under `vault/`. Best for note-native users.
   - `google` — Google Sheets. Requires extra setup in Phase 4.
4. **Hermes profile name.** Default: `relationshiposdemo`. The kit's
   bootstrap script creates a profile of this name to isolate this
   consultant from any personal Hermes assistant they already have.

Do **not** prompt for the Telegram bot token yet — they have to create
the bot first (Phase 3).

## Phase 2: Local Dry Run

Run, in order:

```bash
python3 scripts/relationship_os.py --env .env.example demo --reset
python3 scripts/relationship_os.py --env .env.example status
```

**Verify:**

- The `demo --reset` command exits cleanly and prints "Logged" three times
  (Demo Client, Sarah Lim, Jason Wong).
- The `status` command prints `Relationship OS store: sqlite at
  data/relationship_os.sqlite3` and a `Rows:` line showing 3 Contacts,
  3 Touchpoints, 3 Reminders, 6 Events, and 9 Settings.
- The file `data/relationship_os.sqlite3` exists.
- The folder `data/local_sheet/` contains 5 CSV files with the demo data.

If any of these fail, stop and explain the failure to the consultant.
`TROUBLESHOOTING.md` has a "SQLite or local CSV view not updating" section
that covers the common causes.

## Phase 3: Telegram Bot

This is the only step where the consultant has to do something themselves
that you cannot do for them.

Walk them through `TELEGRAM_BOT_SETUP.md`:

1. Open Telegram, search for `BotFather`, send `/newbot`.
2. Choose a bot name (display name) and a bot username (must end in `bot`).
3. BotFather returns a token like `1234567890:ABC...`. Ask the consultant
   to paste it back to you.
4. Ask them for their own Telegram numeric user ID. They can get it by
   messaging `@userinfobot` in Telegram. This becomes `AUTHORIZED_USER_ID`
   in the `.env` and is what prevents random people from controlling
   their bot if they ever leak the token.

## Phase 4: Hermes Profile

Run:

```bash
bash scripts/bootstrap_hermes_profile.sh <profile-name-from-phase-1>
```

**Verify:**

- The command exits cleanly.
- `~/.hermes/profiles/<profile-name>/` exists.
- `~/.hermes/profiles/<profile-name>/.env` exists and contains
  `RELATIONSHIP_OS_STORE=sqlite`.

Now write the consultant's values into the profile's `.env`:

```bash
# Edit ~/.hermes/profiles/<profile-name>/.env to set:
#   TELEGRAM_BOT_TOKEN=<from Phase 3>
#   AUTHORIZED_USER_ID=<from Phase 3>
#   CONSULTANT_NAME=<from Phase 1>
#   CONSULTANT_TIMEZONE=<from Phase 1>
#   RELATIONSHIP_OS_CONSULTANT_VIEW=<from Phase 1>
```

If the consultant chose `google` for the view, also walk them through
`GOOGLE_SHEETS_SETUP.md` — create a Sheet, create a service account, share
the Sheet with the service account, download the JSON key. Then set in
the profile `.env`:

```
GOOGLE_SHEET_ID=<long string from the Sheet URL>
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account.json
```

Run dependency install if Google view is selected:

```bash
python3 -m pip install -r requirements.txt
```

## Phase 5: Hermes Setup

If this is a brand-new Hermes profile, configure its model provider:

```bash
hermes -p <profile-name> setup
```

The consultant picks the model provider (OpenAI, Anthropic, local Ollama,
etc.) and enters credentials. You cannot do this for them — it depends on
their account.

Test the profile from CLI before connecting Telegram:

```bash
hermes -p <profile-name> -z "status"
hermes -p <profile-name> -z "Had coffee with Demo Client today. Interested in retirement planning. Follow up next Friday."
hermes -p <profile-name> -z "prep Demo Client"
```

**Verify:**

- `status` returns a connection summary identifying SQLite as the store.
- The Demo Client touchpoint message creates a new touchpoint row in
  `data/relationship_os.sqlite3`.
- `prep Demo Client` returns the consultant's recent touchpoints and
  pending reminders for Demo Client.

If any of these fail, the most common cause is that Hermes is not picking
up `SOUL.md` as its instruction. Re-run the bootstrap script.

## Phase 6: Connect Telegram

```bash
hermes -p <profile-name> gateway setup
hermes -p <profile-name> gateway run --replace
```

In a separate terminal:

```bash
python3 scripts/clear_telegram_commands.py ~/.hermes/profiles/<profile-name>/.env
```

This clears the default Telegram slash-command menu, which would
otherwise intercept commands before Hermes sees them.

## Phase 7: End-To-End Test

Ask the consultant to send a test message to their Telegram bot:

```text
status
```

**Verify:** Bot replies with a connection summary.

Then:

```text
Had coffee with Demo Client today. He is interested in retirement planning. Follow up next Friday.
```

**Verify:**

- The bot confirms a touchpoint was logged.
- A new row appears in the Touchpoints table.
- A new row appears in the Reminders table with `due_date` set to the
  Friday of the *next calendar week* (not this week's Friday).
- A new event row appears in the Events table with kind
  `touchpoint_logged`.

If the Friday date is wrong, that means Hermes is resolving "next Friday"
incorrectly. The script does not parse English — Hermes must produce
absolute ISO dates. Re-read `SOUL.md`'s "Touchpoint Extraction" section
and confirm Hermes is using the consultant's timezone.

## Phase 8: Wrap Up

Tell the consultant:

- They can send any meeting note in natural language; Hermes will log it.
- They can text `today` to see what needs attention.
- They can text `prep <Contact Name>` before a meeting.
- They can text `appointment-summary <Name>`, `proposal <Name> <Topic>`,
  `slides <Name> <Purpose>`, or `writeup <Topic>` for draft documents.
- Their consultant-facing view (CSV / Sheets / Obsidian) is **generated**
  from SQLite. The view is the place to *read* the data; the place to
  *change* the data is via Telegram to Hermes. (Future versions may
  support consultant edits in the view; for v1, edits in the view will
  be overwritten on the next sync.)
- Generated PDFs, slide decks, and writeups land in `vault/Generated/`.
  These are *draft outputs* for the consultant's internal review, not
  client-facing deliverables.
- The Events table is an audit log. If something goes weird, run
  `events --since YYYY-MM-DD` to see exactly what happened.

Hand off cleanly. The consultant should now be able to use the bot daily
without your involvement.

## What Not To Do

- Do not create, install, edit, or remove Hermes skills. The bootstrap
  script intentionally limits this consultant's profile to the `terminal`
  tool only.
- Do not edit the kit's source files unless the consultant explicitly
  asks for a customization.
- Do not enter any client data into the kit during setup. Use only the
  demo data the kit ships with for testing.
- Do not commit credentials. `.env`, `credentials/`, and `.env.*` are
  already in `.gitignore`.
- Do not change `RELATIONSHIP_OS_STORE` away from `sqlite`. SQLite is the
  product rule for this kit. The legacy `STORE=google` mode is deprecated
  and will emit a warning if selected.
