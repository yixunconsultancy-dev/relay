# Agent Setup

This file defines how the AI agent layer works in the Relationship Bot Kit.

## Architecture

```
                       ┌─────────────────────────────────────┐
Consultant (Telegram)──┤                                     │
                       │   Hermes (parser + scheduler)       │──┐
                       │   reads SOUL.md                     │  │
                       └─────────────────────────────────────┘  │
                                                                │
                                                                ▼
                                                   ┌────────────────────┐
                                                   │  scripts/          │
                                                   │  relationship_os.py│
                                                   │  (typed write API) │
                                                   └─────────┬──────────┘
                                                             │
                                                             ▼
                                          ┌──────────────────────────┐
                                          │ data/relationship_os     │
                                          │ .sqlite3  (WAL mode)     │
                                          └────────────┬─────────────┘
                                                       │
                                                       ▼
            ┌─────────────────────────┐    ┌──────────────────────────┐
            │  AWMOS desktop app      │    │  Consultant-facing       │
            │  (Tauri + React)        │    │  export views (optional) │
            │  reads + writes via the │    │  - Google Sheets         │
            │  same kit script        │    │  - Local CSV             │
            │                         │    │  - Obsidian Markdown     │
            └─────────────────────────┘    └──────────────────────────┘
```

Two peer writers share the SQLite database: **Hermes** (Telegram-side
parser) and the **AWMOS desktop app** at `/Applications/AWMOS.app`
(consultant-facing UI on the laptop). Both call
`scripts/relationship_os.py` for any operation that needs validation —
the script is the typed write API; it does not parse English. WAL mode +
the Events audit table coordinate them.

Hermes reads `SOUL.md` for parsing behavior, extracts the structured
fields described in "Touchpoint Extraction", and writes via the kit. The
AWMOS app reads the database directly via `@tauri-apps/plugin-sql` and
shells out to the kit for validated writes.

## Product Data Rule

The agent's structured source of truth is SQLite. The consultant chooses only
the human-facing view:

- Google Sheets
- Local CSV
- Obsidian Markdown

Do not treat Markdown, CSV, or Google Sheets as the agent's primary memory when
SQLite is available. Those outputs are mirrors for the consultant to read,
filter, or manually review. PDFs and slide decks are generated deliverables, not
living data stores.

## Supported Agent Runtimes

The kit is designed to work with any of these:

### Option A: Hermes Profile (Recommended)

Run a dedicated Hermes profile per consultant. The AI reads `SOUL.md` as its
core instruction and uses the helper script to write data.

Best for: always-on consultant operation through Telegram.

### Option B: Claude Code / Codex Assisted Setup

Use Claude Code or Codex to help configure the Hermes profile, Telegram bot,
and Google Sheet.

Setup: see `HERMES_SETUP.md`

Best for: setup support and iteration.

### Option C: Assisted Setup

Someone from the team sets up the bot for the consultant in a 30-45 minute session, configuring all credentials and verifying the pipeline works end-to-end.

Best for: consultants who want the system but not the setup process.

## Agent Responsibilities

The agent must:

1. Monitor the Telegram bot for incoming messages.
2. Parse natural language using the schema in `SOUL.md`'s "Touchpoint
   Extraction" section. The script does not parse English; the agent does.
3. Resolve relative dates ("next Friday", "in two weeks", "tomorrow") to
   absolute ISO YYYY-MM-DD values using the consultant's timezone before
   calling the helper.
4. Validate enum choices (`touchpoint_type`, `sentiment`, `contact_type`,
   `relationship_stage`, `reminder_priority`, `reminder_type`,
   `relationship_kind`) against the lists in `SOUL.md` before writing.
5. Call the appropriate kit subcommand for each operation:
   - `log-touchpoint` — create/update contacts, log touchpoints, create reminders
   - `update-contact` — set consultant-managed fields (phone, email, address,
     family, financial_concerns, interests, referral_source, etc.)
   - `complete-reminder` / `snooze-reminder` / `cancel-reminder` —
     reminder lifecycle
   - `find-reminders` — fuzzy reminder search before completion
   - `add-policy` / `update-policy` / `archive-policy` — structured policy data
   - `link-contact` / `unlink-contact` — family / friend / business ties
   - `merge-contacts` — consolidate accidental duplicates
   - `archive-contact` / `rename-contact` — contact lifecycle
   - `queue-clarification` — park low-confidence bulk-import items for
     the consultant to triage later in the app's `/clarifications` route
   - `today-brief` — composite daily agenda; used by the 9am Telegram
     morning brief cron job set up via Hermes's own `/cron` scheduler
6. Generate daily focus summaries on request or schedule.
7. Respond to queries about contacts, history, and knowledge.
8. Keep consultant-facing views synced from the SQLite source of truth (the
   helper does this automatically after each write).
9. **Don't fight the AWMOS desktop app.** The app is a peer writer; both
   sides emit events to the audit table and poll for each other's changes.
   See `SOUL.md` "Storage Interface" for the shared contract.

The agent must NOT:

- Send messages to anyone other than the consultant
- Generate client-facing content, scripts, or broadcasts
- Access data outside the consultant's own Relationship OS database and chosen
  consultant-facing view
- Make financial recommendations
- Store credentials anywhere except `.env`

## Multi-Agent Notes

If running multiple consultants, each gets their own:

- Telegram bot (separate BotFather token)
- SQLite database
- Consultant-facing view (separate Sheet, CSV folder, or Obsidian vault folder)
- Agent instance (separate session or Hermes profile)
- `.env` file (separate credentials)

No data is shared between consultants.
