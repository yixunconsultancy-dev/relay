# Setup UX Recommendations: AWM Relationship OS Kit

Recommendation: make setup feel like a guided onboarding checklist, not a developer installation. The user should always know what they are doing, why it matters, how long it will take, and how to verify it worked.

## Target user assumptions

Primary user:

- financial consultant or agency manager
- comfortable with Telegram and one simple review surface, usually Google Sheets
- may not understand tokens, environment variables, APIs, or terminal output
- wants the system working quickly
- is sensitive to privacy and compliance risk

The setup should therefore avoid developer language wherever possible. When technical terms are unavoidable, define them once in plain English.

## Recommended setup structure

Use a two-track entry point.

```text
START_HERE.md
  |
  +-- Assisted Setup
  |     Best if you want someone to guide the setup.
  |
  +-- DIY Setup
        Best if you are comfortable following technical instructions with Claude Code / Codex.
```

## START_HERE.md flow

### Step 0: Set expectations

Show this before any technical action.

```text
You are setting up a private Telegram-based relationship tracking system.

You will need:
- a Google account only if you choose Google Sheets as the review view
- Telegram installed
- access to Claude Code or Codex
- 30–75 minutes depending on setup track

This system does not send messages to clients.
```

Why:

- reduces anxiety
- clarifies privacy boundary
- prevents users from expecting a finished SaaS app

### Step 1: Choose setup track

Ask one question:

```text
Do you want guided setup or DIY setup?

A. Assisted Setup — recommended if you are not technical
B. DIY Setup — recommended if you are comfortable with Claude Code / Codex
```

Do not present both full instruction sets at once. Non-technical users should not see terminal-heavy content unless they choose DIY.

### Step 2: Account readiness checklist

Before setup begins, verify prerequisites.

```text
Before continuing, confirm:
[ ] If choosing Google Sheets, I can open Google Sheets
[ ] I can create a Telegram bot with BotFather
[ ] I can access Claude Code or Codex
[ ] I understand this system stores structured data in SQLite
[ ] I understand I can review it in Google Sheets, local CSV, or Obsidian Markdown
[ ] I understand it does not send messages to clients
```

Why:

- prevents mid-setup stalls
- reinforces privacy boundaries
- creates a sense of progress before technical work begins

### Step 3: Choose the consultant-facing view

User-facing copy:

```text
Choose where you want to review your relationship records.

The agent keeps its structured memory in SQLite. You can review a mirrored copy
in Google Sheets, local CSV files, or Obsidian Markdown.
```

Verification:

```text
Checkpoint: You should have selected Google Sheets, local CSV, or Obsidian Markdown.
```

### Step 4: Create the Telegram bot

User-facing copy:

```text
Telegram uses a tool called BotFather to create private bots.

The bot token is like a password. Do not share it in public chats or documents.
```

Verification:

```text
Checkpoint: You should have a bot token that looks like this:
123456789:ABCdef_example_token
```

Avoid saying:

- “configure bot API credentials”
- “set env var TELEGRAM_BOT_TOKEN” before explaining what it means

### Step 5: Run the Claude Code / Codex setup prompt

The setup prompt should behave like an interview, not a dump of instructions.

Recommended prompt behaviour:

1. explain the next action
2. ask for only one or two values at a time
3. validate the value format
4. summarize what was received
5. continue to the next step

Bad flow:

```text
Paste all credentials and config now.
```

Better flow:

```text
First, paste your Telegram bot token.
I will only check the format at this stage.
```

### Step 6: Build the database schema

The assistant should create or confirm these tabs:

- Clients
- Policies
- Meetings
- Follow Ups
- Candidates
- Coaching
- Knowledge Base
- Settings
- Audit Log

Verification:

```text
Checkpoint: Your selected view should now contain the required tables, tabs, or notes.
```

### Step 7: First test record

Do not use a real client for the first test.

Use a sample record:

```text
Name: Demo Client
Context: Annual review next week. Interested in retirement planning. Has two children.
Next action: Prepare review questions by Friday.
```

Verification:

```text
Checkpoint: Ask the Telegram bot:
prep Demo Client

Expected result:
The bot returns a short prep summary and suggested questions.
```

### Step 8: Privacy and usage confirmation

Before the user starts using real data, include a clear confirmation.

```text
Before using real client data, confirm:
[ ] I know where the data is stored
[ ] I know which consultant-facing view I selected
[ ] I will not use this system to send client messages
[ ] I will review outputs before relying on them
```

## Guided setup experience

The guided setup should feel like this:

```text
1 of 8  Choose setup track
2 of 8  Confirm accounts
3 of 8  Choose review view
4 of 8  Create Telegram bot
5 of 8  Connect bot to Relationship OS
6 of 8  Create database and view
7 of 8  Test with demo record
8 of 8  Start daily workflow
```

Use numbered progress because non-technical users need reassurance that setup is finite.

## Assisted Setup recommendations

For assisted setup, provide a facilitator checklist.

### Before the call

Ask the consultant to prepare:

- Google account access
- Telegram access
- Claude Code / Codex access if required
- permission to create a private Google Sheet if they choose that view
- 30 minutes uninterrupted time

### During the call

The facilitator should:

1. explain the privacy boundary first
2. choose the consultant-facing view with the user watching
3. create the Telegram bot with the user controlling the token
4. paste values into the setup only when needed
5. verify the demo record
6. show the daily workflow
7. end with “what to do tomorrow morning”

### After the call

Give the user a one-page handover:

- what was created
- where the SQLite database and consultant-facing view live
- what the Telegram bot is called
- how to add a note
- how to ask for meeting prep
- how to check follow-ups
- what the system does not do

## DIY Setup recommendations

DIY setup should be split into small files rather than one long technical document.

Recommended files:

```text
START_HERE.md
DIY_SETUP.md
TELEGRAM_BOT_SETUP.md
GOOGLE_SHEETS_SETUP.md
ENVIRONMENT_VALUES.md
VERIFICATION_CHECKLIST.md
TROUBLESHOOTING.md
PRIVACY_AND_LIMITS.md
```

Each file should have:

- purpose
- time estimate
- steps
- checkpoint
- common errors
- next file link

## Error messaging tone

Error messages should be calm, specific, and recovery-oriented.

Formula:

```text
What happened.
Why it usually happens.
What to do next.
```

### Examples

Bad:

```text
Error: invalid credentials.
```

Better:

```text
The bot could not connect to Telegram.

This usually happens when the bot token was copied with an extra space or missing character.

Next step: copy the token from BotFather again and paste it exactly as shown.
```

Bad:

```text
View sync failed.
```

Better:

```text
The system could not sync the consultant-facing view.

For Google Sheets, this usually means the sheet permission or sheet ID is not correct.

Next step: open the Google Sheet, copy the full URL, and run the sheet connection step again.
```

Bad:

```text
Command not found.
```

Better:

```text
Your computer could not find the command needed for this step.

This usually means one setup tool is not installed yet.

Next step: go back to the prerequisites checklist and install the missing tool before continuing.
```

## Verification checkpoints

Every major setup step needs a visible proof point.

Recommended checkpoints:

1. Consultant-facing view exists

Proof:

- user can open the selected view
- selected view has expected name or folder path

2. Required tabs exist

Proof:

- Clients, Meetings, Follow Ups, Candidates, Coaching tabs are visible

3. Telegram bot exists

Proof:

- user can open the bot in Telegram
- bot responds to /start

4. Bot can read settings

Proof:

- status returns connected services

5. Bot can write demo data

Proof:

- demo client appears in the Clients tab

6. Bot can retrieve demo data

Proof:

- prep Demo Client returns a useful summary

7. Reminder logic works

Proof:

- demo follow-up appears when asking for today’s follow-ups

8. Privacy boundary acknowledged

Proof:

- user checks final confirmation before entering real data

## Progress indicator design

For markdown setup:

```text
Progress: [###-----] 3/8 — Create your Telegram bot
```

For future web UI:

- slim horizontal progress bar
- gold active state (#C6A34F)
- graphite completed states
- no confetti, emoji, or playful animation
- show estimated time remaining only at the section level

Example:

```text
Step 4 of 8
Create your Telegram bot
Estimated time: 5 minutes
```

## Smoothness principles for non-technical FCs

### Ask for one thing at a time

Do not ask for bot token, sheet URL, deployment target, timezone, and schema preferences in one screen.

### Use human labels before technical labels

Use:

```text
Telegram bot token
This is the private password that lets the system talk to your Telegram bot.
```

Then show:

```text
TELEGRAM_BOT_TOKEN=...
```

### Default decisions aggressively

Non-technical users should not decide column names, schema design, command names, or deployment structure.

Recommended defaults:

- timezone: ask once, then store
- sheet tabs: create automatically
- command names: use simple plain-text commands in Hermes v0; add native slash commands only after the gateway registers them
- sample data: provide demo record
- daily rhythm: morning / after meeting / end of day

### Separate setup from habit training

Installation is not adoption. After setup works, immediately show the three daily actions:

```text
Morning: ask “What should I focus on today?”
After meeting: send rough notes
End of day: ask “What follow-ups are still open?”
```

## Recommended Telegram command text

Keep command names short and memorable.

```text
/start      Check that the bot is working
status      Show connected services
add         Add a raw note
prep        Prepare for a client or candidate conversation
followups   Show open follow-ups
today       Show today's priorities
search      Search notes and records
help        Show available commands
```

Avoid long commands such as:

```text
/generate_client_meeting_preparation_summary
```

## Documentation UX details

### Use “Stop here” moments

At critical points, tell the user not to continue until the checkpoint passes.

```text
Stop here until your bot replies to /start.
If it does not reply, go to Troubleshooting: Telegram bot does not respond.
```

### Use copy blocks sparingly

Only put exact commands or prompts in code blocks. Do not put long explanations in code blocks.

### Put troubleshooting next to the step

Do not force users to search a separate file for the three most common failures. Add a short “If this fails” section under each step, then link to the full troubleshooting file.

## Final handover moment

End setup with a strong, practical close:

```text
Your Relationship OS is ready.

Tomorrow morning, open Telegram and ask:
today

After your next meeting, send rough notes and let the system structure them.
```

Why:

- gives the user an immediate next behaviour
- shifts from installation to habit
- makes the product feel useful on day one

## Open questions

1. Will the first version run locally, on a hosted service, or through a no-code automation layer?
2. Will AWM provide official Google Sheets, CSV, and Obsidian view templates, or should the setup assistant generate them from scratch?
3. Should managers have a different schema from individual consultants?
4. Should the kit include compliance language approved by AWM before real client data is entered?
