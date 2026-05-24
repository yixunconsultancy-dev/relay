# Telegram Bot Setup

Step-by-step guide to creating your private Telegram bot for the Relationship OS Kit.

## Step 1: Create your bot via BotFather

1. Open Telegram and search for `@BotFather`, or go to [t.me/botfather](https://t.me/botfather).
2. Send `/newbot`.
3. Choose a **display name** (e.g. "My Relationship Tracker").
4. Choose a **username** — must end in `bot` and be globally unique (e.g. `myname_relationship_bot`).
5. BotFather replies with your **bot token**. It looks like: `4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc`

**Save the token immediately.** You'll add it to your `.env` file.

## Step 2: Configure the bot

Send `/mybots` to BotFather, select your bot, then:

1. **Edit Bot > Edit Description** — set to: "Private relationship tracker for [Your Name]"
2. **Edit Bot > Edit About** — set to: "Captures meeting notes, tracks follow-ups, manages client relationships"
3. For v0, skip custom bot commands unless you are only setting `/start`.
   Relationship OS commands are sent as plain text because Hermes may intercept
   slash commands before the agent sees them. If you later add native gateway
   commands, use:
   ```
   start - Start the bot and see instructions
   today - Show today's priorities and follow-ups
   prep - Prepare for a client meeting
   help - Show available commands
   ```

## Step 3: Store your token securely

Add the token to your `.env` file:

```bash
TELEGRAM_BOT_TOKEN=4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc
```

**Security rules:**
- Never commit the token to version control (`.env` should be in `.gitignore`)
- If compromised, send `/revoke` to BotFather — the old token stops working immediately
- Only share the token with systems that need direct bot control

## Step 4: Find your Telegram user ID

The bot should only respond to you. To get your user ID:

1. Send any message to your new bot.
2. In your bot code or agent, inspect the incoming update — your ID is in `update.message.from.id`.
3. Add it to `.env`:
   ```bash
   AUTHORIZED_USER_ID=987654321
   ```

The bot will reject messages from anyone else.

## Step 5: Connect it to the Hermes profile

The Telegram bot is only the inbox. The Hermes profile is the worker behind it.

Put the token in the profile env file:

```text
~/.hermes/profiles/relationshiposdemo/.env
```

Then run:

```bash
hermes -p relationshiposdemo gateway setup
hermes -p relationshiposdemo gateway run --replace
```

## Step 6: Test the connection

Send `/start` to your bot in Telegram. If the bot is running, it should reply
with a welcome message.

Then send:

```text
status
```

Then send a test relationship update:

```
Had coffee with Sarah today, she's interested in retirement planning, follow up next week.
```

If everything is connected, the bot should confirm the log and the SQLite
source of truth should update. For the default local CSV view, check
`data/local_sheet/`. For Google Sheets view, check the Google Sheet.

## How the bot receives messages

The kit uses **long polling** — the bot periodically checks Telegram for new messages. This is the simplest approach:

- No server or domain required
- Works from your laptop, a home machine, or a simple cloud instance
- No HTTPS certificate needed
- Ideal for a single-user private bot

The bot process must be running for messages to be received. See `AGENTS.md` for options on keeping it running.

## Runtime

This kit uses the Hermes gateway for Telegram. You do not need to install a
separate Telegram bot framework for v0.

## Common issues

| Problem | Fix |
|---|---|
| Bot doesn't respond | Check the token in `.env` matches BotFather, verify the bot process is running |
| 401 Unauthorized | Token is invalid or was revoked — get the current one from BotFather |
| 409 Conflict | Two processes polling the same bot — stop the old one first |
| Bot receives old messages on restart | Normal with long polling — the bot processes and acknowledges them |

See `TROUBLESHOOTING.md` for more detailed fixes.

## Next step

Once your bot token is saved in `.env` and you can send `/start`, proceed to [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md).
