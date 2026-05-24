# Agent Setup

This file defines how the AI agent layer works in the Relationship Bot Kit.

## Architecture

```
Consultant (Telegram)
  → Telegram Bot API
  → AI Agent
  → SQLite source of truth
  → Consultant-facing view: Google Sheets, local CSV, or Obsidian Markdown
```

The Hermes agent sits between Telegram and the Relationship OS store. It
receives natural-language messages, follows `SOUL.md`, extracts the
structured fields described in `SOUL.md`'s "Touchpoint Extraction" section,
and calls `scripts/relationship_os.py log-touchpoint --json-file <path>` to
write that structured data. The script is a typed, validated write API; it
does not parse English.

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
   `relationship_stage`, `reminder_priority`, `reminder_type`) against the
   lists in `SOUL.md` before writing.
5. Call `log-touchpoint --json-file <path>` (or the individual flags) to
   create or update contacts, log touchpoints, and create reminders.
6. Generate daily focus summaries on request or schedule.
7. Respond to queries about contacts, history, and knowledge.
8. Keep consultant-facing views synced from the SQLite source of truth (the
   helper does this automatically after each write).

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
