# Morning Brief Setup (9am SGT Telegram)

The morning brief is a once-a-day Telegram message summarising the
day's agenda: reminders due, birthdays today, ripe-to-reach-out
prospects, and the top of the relationship debt inbox. Runs at 9:00am
local time via macOS launchd.

`SOUL.md` instructs Hermes to set this up on first initialisation. This
doc is for manual setup, debugging, and reference.

## What gets installed

- `~/Library/LaunchAgents/com.awm.relationshipos.morning-brief.plist`
  — launchd agent, fires at 9:00 local time daily
- Logs at `~/Library/Logs/awmos-morning-brief.log` (script output) and
  `~/Library/Logs/awmos-morning-brief.{out,err}.log` (launchd stdio)

Nothing else. The plist points back at the kit folder; deleting the
agent unloads cleanly.

## Prereqs

Two env vars in your `.env` (the same file your Hermes profile uses):

```bash
TELEGRAM_BOT_TOKEN=123456:abcdefghijk
TELEGRAM_CHAT_ID=99999999
```

To find your chat ID: open Telegram, send any message to the
[@userinfobot](https://t.me/userinfobot), and read the `Id` it replies
with. (Or query `https://api.telegram.org/bot$TOKEN/getUpdates` after
sending a message to your AWMOS bot — your chat ID is in the response.)

## Install (one command)

```bash
cd "/Users/luc/Documents/paperclip/deliverables/AWM/Relationship OS Kit"
bash scripts/install-morning-brief-cron.sh
```

The helper verifies prereqs, renders the plist template, bootstraps the
agent, and sends a one-shot test brief so you know the wiring works.
Re-run anytime — it's idempotent.

Skip the test send: `SKIP_TEST=1 bash scripts/install-morning-brief-cron.sh`

## Verify

```bash
# Is the agent loaded?
launchctl print gui/$(id -u)/com.awm.relationshipos.morning-brief

# Trigger a brief NOW (doesn't wait for 9am)
bash scripts/send_morning_brief.sh

# Tail the log
tail -f ~/Library/Logs/awmos-morning-brief.log

# Inspect what today-brief would say without sending
python3 scripts/relationship_os.py --env .env --format=text today-brief
```

## Pause / resume

When you're on vacation or otherwise want to mute the brief:

```bash
# Pause
launchctl bootout gui/$(id -u)/com.awm.relationshipos.morning-brief

# Resume
launchctl bootstrap gui/$(id -u) \
  ~/Library/LaunchAgents/com.awm.relationshipos.morning-brief.plist
```

Don't add conditional-send logic to the script — it's deliberately
unconditional so the "Inbox zero" state itself is useful information
(you confirm there's nothing pressing today).

## Uninstall

```bash
launchctl bootout gui/$(id -u)/com.awm.relationshipos.morning-brief
rm ~/Library/LaunchAgents/com.awm.relationshipos.morning-brief.plist
```

The kit's `scripts/send_morning_brief.sh` and template plist stay in
place under the kit folder so a future re-install is one command.

## Manual install (without the helper)

If `install-morning-brief-cron.sh` breaks or you want to understand
each step:

```bash
KIT_ROOT="/absolute/path/to/Relationship OS Kit"
LABEL="com.awm.relationshipos.morning-brief"
TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"

# Render the template
sed \
  -e "s|__KIT_ROOT__|$KIT_ROOT|g" \
  -e "s|__HOME__|$HOME|g" \
  "$KIT_ROOT/scripts/launchd/${LABEL}.plist" > "$TARGET"

# Load it
launchctl bootstrap gui/$(id -u) "$TARGET"
launchctl enable gui/$(id -u)/${LABEL}

# Smoke test
bash "$KIT_ROOT/scripts/send_morning_brief.sh"
```

## What goes in the brief

The Python kit's `today-brief` command (see `scripts/relationship_os.py`)
produces it. Sections in order:

1. **Greeting** — date + consultant name from `settings.name`
2. **Reminders due today** — pending reminders with `due_date <= today`,
   sorted high → low priority (top 10)
3. **Birthdays today** — contacts whose birthday MM-DD matches today
4. **Ripe to reach out** — top 5 contacts by composite score (≥2 positive
   touchpoints in last 30 days, last touch ≤21 days, not yet a client)
5. **Relationship debt** — top 5 by category urgency (at_risk >
   unfollowed_action > cooling > stale_prospect), with the total count

The `--format=json` variant returns the same data as structured JSON
plus a `brief_text` field with the rendered text. Useful if you want
to send the brief through a different channel (email, in-app notification,
Slack) — the data is right there.

## Troubleshooting

**"No python3 found on PATH"** — launchd uses a minimal PATH. The script
auto-detects pyenv/asdf/Homebrew, but if your Python is somewhere else,
set `RELATIONSHIP_OS_PYTHON` in your `.env`:

```
RELATIONSHIP_OS_PYTHON=/custom/path/to/python3
```

**"Telegram sendMessage failed"** — check the log for the API response.
Most common: wrong `TELEGRAM_CHAT_ID` (Telegram returns
`{"ok":false,"description":"chat not found"}`), or the bot wasn't
started by the consultant (open Telegram, /start the bot once).

**"Agent loaded but no brief at 9am"** — check `launchctl print` for
recent invocation timestamps. Possible causes: Mac was asleep at 9:00am
(launchd skips and waits until next day — no catch-up), `KeepAlive` is
false so a crashed run doesn't retry. The brief is best-effort; if you
miss a day, you can fire it manually with `bash send_morning_brief.sh`.

**Output looks weird** — run `today-brief --format=text` manually
without launchd to see exactly what's being sent. Often it's a data
issue (e.g. a contact with a malformed birthday) rather than a script
bug.
