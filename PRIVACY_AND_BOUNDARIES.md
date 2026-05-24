# Privacy and Boundaries

This document defines what the relationship bot can and cannot access, and how data is handled.

## Data Ownership

- All data belongs to the individual consultant
- Structured data is stored in the consultant's local SQLite Relationship OS database
- The consultant-facing view may be Google Sheets, local CSV, or Obsidian Markdown
- No stored Relationship OS database is shared with AWM or other consultants
- No data is sent to external analytics or tracking services

Important: message text is processed by the configured Hermes model provider
unless the consultant uses a local model. Do not describe the system as
"no third-party processing" unless the model runtime has been configured and
verified that way.

## What the Bot Accesses

### Reads
- The consultant's SQLite Relationship OS database
- The consultant's chosen view only when syncing or generating review material
- Telegram messages sent directly to the bot by the consultant

### Writes
- The consultant's SQLite Relationship OS database
- The consultant's chosen view: Google Sheets, local CSV, or Obsidian Markdown
- Telegram replies back to the consultant only

### Does NOT Access
- The consultant's email
- The consultant's calendar (unless explicitly integrated later)
- Any client's personal devices or accounts
- Any social media accounts
- Any company CRM or database
- Other consultants' data

## Message Handling

- Telegram messages are processed in real time and not stored beyond the structured entries they create
- Raw input text is stored in the Touchpoints table/view (`raw_input` column) for the consultant's reference
- The bot does not forward, share, or expose messages to anyone other than the consultant

## What the Bot Does NOT Do

- Send messages to clients or prospects (no WhatsApp, no SMS, no email)
- Post on social media
- Access or modify client financial records
- Make financial recommendations
- Store sensitive financial data (policy numbers, account details) unless the consultant explicitly provides them
- Share data between consultants

## Data Retention

- Data persists in SQLite until the consultant deletes it
- In Google Sheets, CSV, or Obsidian view mode, the consultant-facing copy remains available for review
- If the bot is disconnected, the SQLite database and any mirrored views remain with historical data

## Credentials

- Telegram bot token: stored in `.env`, never committed to version control
- Google Sheets API credentials: stored locally, never shared
- Model provider credentials are managed by Hermes profile configuration
- No Relationship OS credentials should be committed to version control

## Compliance Notes

- This system is a personal productivity tool, not a regulated financial system
- It does not provide financial advice or make investment decisions
- Consultants remain responsible for their own client interactions and compliance obligations
- If the consultant's organisation has data handling policies, those take precedence
