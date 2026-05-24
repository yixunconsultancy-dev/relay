# AWM Relationship OS Kit

Private relationship intelligence for financial consultants, delivered as a
Hermes-powered Telegram assistant with a SQLite source of truth and a visible
consultant-facing dashboard or notes view.

> **Roadmap note (May 2026):** the v2 consultant-facing surface is a native
> macOS desktop app (Tauri + React) that reads and writes the same SQLite
> database as Hermes. Spec lives at `app/SCOPING.md`; the app itself will be
> built in `app/`. Once it ships, the existing CSV / Google Sheets / Obsidian
> outputs are demoted to optional *export* formats rather than the daily edit
> surface. The kit's Python helper script remains the typed write API used by
> both Hermes (from Telegram) and the desktop app (via shell-out).

## What This Is

This kit helps a consultant capture relationship notes from Telegram and turn
them into structured records:

- Contacts
- Touchpoints
- Reminders
- Daily focus summaries

The v0 runtime is deliberately narrow. It proves the daily loop first:

```text
Telegram note -> Hermes agent -> Relationship OS helper -> SQLite -> consultant view
```

Recruitment tracking, advisor coaching, knowledge base search, household
mapping, calendar integration, and richer policy tracking are future modules.

## v0 Capabilities

The first usable version supports:

- Natural-language note logging
- Contact creation and updates
- Touchpoint logging
- Follow-up reminder creation
- Obsidian-style Markdown vault export
- Draft appointment summaries, proposals, slide decks, and topic writeups
- `status`
- `today`
- `prep Name`
- `help`

Use plain text commands in Telegram for v0. Native Telegram slash commands can
be added later, but the Hermes gateway may intercept them before the agent sees
the message.

Example note:

```text
Had coffee with Demo Client today. He is interested in retirement planning. Follow up next Friday.
```

Expected output:

- A row in `Contacts`
- A row in `Touchpoints`
- A pending row in `Reminders`

## What It Does Not Do

This system does not:

- Send client-facing messages
- Draft WhatsApp, SMS, email, broadcast, newsletter, or social media copy
- Make financial recommendations
- Replace official systems of record
- Claim compliance approval

It is a private operating aid for memory, preparation, and follow-through.

## Runtime Model

Each consultant should have an isolated setup:

- One Telegram bot token
- One Hermes profile
- One SQLite data store
- One consultant-facing view
- One `.env` file

The bootstrap limits the consultant profile to the `terminal` tool for CLI and
Telegram, so the agent can call the Relationship OS helper without reaching for
unrelated Hermes tools.

Product rule: the agent's structured source of truth is SQLite. Google Sheets,
local CSV, and Obsidian Markdown are consultant-facing views mirrored from that
source. PDFs and slide decks are generated deliverables, not living stores.

The supported consultant-facing views are:

- `csv` for local testing under `data/local_sheet/`
- `google` for a consultant's Google Sheet
- `obsidian` for Markdown notes under the configured vault folder

## Quick Start

Start with [START_HERE.md](./START_HERE.md).

The practical flow is:

1. Run the local dry run.
2. Create a fresh Hermes profile.
3. Connect a new Telegram bot.
4. Test with demo data.
5. Switch the consultant-facing view from local CSV to Google Sheets if needed.

## Files

```text
SOUL.md                         Hermes runtime instruction
SETUP.md                        Setup walkthrough addressed to a helper AI agent
scripts/relationship_os.py      v0 storage helper
scripts/bootstrap_hermes_profile.sh
scripts/clear_telegram_commands.py
docs/CONSULTANT_TEST_PLAN.md
DATA_SCHEMA.md
REMINDER_RULES.md
RELATIONSHIP_RULES.md
PRIVACY_AND_BOUNDARIES.md
TELEGRAM_BOT_SETUP.md
GOOGLE_SHEETS_SETUP.md
HERMES_SETUP.md
TROUBLESHOOTING.md
.env.example
```

## Local Dry Run

```bash
python3 scripts/relationship_os.py --env .env.example demo --reset
python3 scripts/relationship_os.py --env .env.example status
python3 scripts/relationship_os.py --env .env.example prep --name "Demo Client"
python3 scripts/relationship_os.py --env .env.example today
python3 scripts/relationship_os.py --env .env.example export-md
python3 scripts/relationship_os.py --env .env.example appointment-summary Demo Client
python3 scripts/relationship_os.py --env .env.example proposal Demo Client retirement planning
python3 scripts/relationship_os.py --env .env.example slides Demo Client annual review
python3 scripts/relationship_os.py --env .env.example writeup retirement
```

Inspect the output in:

```text
data/relationship_os.sqlite3
data/local_sheet/
vault/
```

Generated deliverables are stored under:

```text
vault/Generated/{appointment_summary|proposal|slides|writeup}/
```

Markdown note exports preserve consultant edits outside the
`relationship-os:generated` marker block on re-export.

## Hermes Profile Dry Run

```bash
bash scripts/bootstrap_hermes_profile.sh relationshiposdemo
hermes -p relationshiposdemo -z "status"
hermes -p relationshiposdemo -z "Had coffee with Demo Client today. Interested in retirement planning. Follow up next Friday."
hermes -p relationshiposdemo -z "prep Demo Client"
```

## Privacy Position

The structured data is stored in the consultant's local SQLite Relationship OS
database, then mirrored into their chosen consultant-facing view: local CSV,
Google Sheets, or Obsidian Markdown.

Message text is processed by the configured Hermes model provider unless the
consultant uses a local model. Consultants should not enter data their
organization does not allow in this system.
