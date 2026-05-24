# Morning Brief Setup (9am SGT Telegram)

The morning brief is a once-a-day Telegram message summarising the
day's agenda: reminders due, birthdays today, ripe-to-reach-out
prospects, and the top of the relationship debt inbox.

Two install paths, in order of preference:

1. **Hermes native cron** (recommended) — Hermes ships with its own
   scheduler. Tell it once, it handles everything.
2. **macOS launchd fallback** — only for setups that don't run Hermes
   or where Hermes cron isn't available.

## Path 1: Hermes native cron (recommended)

If you're running Hermes as the consultant's Telegram agent, just tell
it to set this up. Either ask in chat:

> Hermes, set up the morning brief — every morning at 9am Singapore time,
> run today-brief and send the output to me on Telegram.

…or invoke explicitly via `/cron`:

```text
/cron add "0 9 * * *" "Run `python3 scripts/relationship_os.py --env <profile_env> --format=text today-brief` from the kit folder and send the output to me on Telegram."
```

(Substitute `<profile_env>` with the actual env file path Hermes uses
for this profile.)

`SOUL.md` already includes this instruction in its "Morning Brief"
section, so a freshly-initialised Hermes profile will offer to set it
up the first time you start chatting with it.

### Manage from chat or CLI

```
/cron list                    # see all jobs (chat)
hermes cron list              # same, CLI
/cron pause <job_id>          # mute the brief (e.g. vacation)
/cron resume <job_id>
/cron run <job_id>            # trigger NOW (test send)
/cron remove <job_id>         # delete it entirely
```

### What gets delivered

The brief is the plain-text output of:

```bash
python3 scripts/relationship_os.py --env .env --format=text today-brief
```

Sections in order:

1. Greeting + date
2. Reminders due today (priority-sorted, top 10)
3. Birthdays today (with age if known)
4. Ripe to reach out (top 5)
5. Relationship debt (top 5 by category urgency)

To preview what tomorrow's brief would look like:

```bash
cd "/Users/luc/Documents/paperclip/deliverables/AWM/Relationship OS Kit"
python3 scripts/relationship_os.py --env .env.example --format=text today-brief
```

## Path 2: macOS launchd fallback

Use only if Hermes's native cron isn't available. This installs a
macOS-level launchd agent that runs independently of Hermes.

### Prereqs

Two env vars in your `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:abcdefghijk
TELEGRAM_CHAT_ID=99999999
```

To find your chat ID: send any message to
[@userinfobot](https://t.me/userinfobot) on Telegram, read the `Id`
back.

### Install (one command)

```bash
cd "/Users/luc/Documents/paperclip/deliverables/AWM/Relationship OS Kit"
bash scripts/install-morning-brief-cron.sh
```

The helper:
- Verifies the env vars exist
- Renders the plist template from `scripts/launchd/com.awm.relationshipos.morning-brief.plist`
- Copies it to `~/Library/LaunchAgents/`
- Bootstraps the agent with `launchctl`
- Fires a one-shot test send (skip with `SKIP_TEST=1`)

Re-running is idempotent — it cleanly replaces the previous load.

### Manage

```bash
# Is the agent loaded?
launchctl print gui/$(id -u)/com.awm.relationshipos.morning-brief

# Trigger NOW (without waiting for 9am)
bash scripts/send_morning_brief.sh

# Tail the log
tail -f ~/Library/Logs/awmos-morning-brief.log

# Pause (vacation)
launchctl bootout gui/$(id -u)/com.awm.relationshipos.morning-brief

# Resume
launchctl bootstrap gui/$(id -u) \
  ~/Library/LaunchAgents/com.awm.relationshipos.morning-brief.plist

# Uninstall
launchctl bootout gui/$(id -u)/com.awm.relationshipos.morning-brief
rm ~/Library/LaunchAgents/com.awm.relationshipos.morning-brief.plist
```

### What's in the fallback

- `scripts/send_morning_brief.sh` — pipes `today-brief --format=text`
  output to Telegram Bot API. Auto-detects python via pyenv/asdf/brew
  fallback (launchd PATH is minimal).
- `scripts/launchd/com.awm.relationshipos.morning-brief.plist` —
  launchd template, `StartCalendarInterval` at Hour=9 Minute=0 local
  time.
- `scripts/install-morning-brief-cron.sh` — idempotent installer.

## When to use which

| Situation | Use |
|---|---|
| Running Hermes as the Telegram agent (normal case) | Path 1 (Hermes cron) |
| Running the kit standalone, no Hermes | Path 2 (launchd) |
| Hermes on the consultant's Mac is flaky / often quit | Path 2 (launchd) — survives Hermes restarts independently |
| Testing what the brief looks like without scheduling anything | Just run `today-brief` directly |

Don't install BOTH — you'll get two messages every morning. Pick one.

## Troubleshooting

**Hermes path: "No job created"** — check `/cron list`. If Hermes
declined or got confused by the instruction, paste the explicit
`/cron add` form from the SOUL.md instructions above.

**launchd path: "No python3 found"** — set `RELATIONSHIP_OS_PYTHON`
in your `.env`:
```
RELATIONSHIP_OS_PYTHON=/custom/path/to/python3
```

**launchd path: "Telegram sendMessage failed"** — check the log for
the API response. Most common: wrong `TELEGRAM_CHAT_ID` (Telegram
returns `"chat not found"`), or the bot wasn't started by the
consultant (open Telegram, /start the bot once).

**launchd path: "Agent loaded but no brief at 9am"** — Mac was asleep
at 9:00am. launchd skips and waits for next day, no catch-up. Fire
manually with `bash send_morning_brief.sh`.

**Brief output looks weird** — run `today-brief --format=text` manually
without launchd/Hermes to see exactly what's being sent. Often it's a
data issue (e.g. a contact with a malformed birthday) rather than a
script bug.
