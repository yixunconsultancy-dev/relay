#!/usr/bin/env python3
"""Clear Telegram's command menu for a Relationship OS test bot.

Hermes registers its own slash-command menu when the gateway starts. Relationship
OS v0 uses plain text commands instead, so this helper clears the menu after the
gateway is running.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] in {"-h", "--help"}:
        print("Usage: python3 scripts/clear_telegram_commands.py /path/to/.env", file=sys.stderr)
        return 0 if len(sys.argv) == 2 else 2

    env_path = Path(sys.argv[1]).expanduser()
    if not env_path.exists():
        print(f"Env file not found: {env_path}", file=sys.stderr)
        return 2

    token = load_env(env_path).get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        print("TELEGRAM_BOT_TOKEN is missing.", file=sys.stderr)
        return 2

    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/deleteMyCommands",
        data=b"",
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        print(f"Failed to reach Telegram: {exc}", file=sys.stderr)
        return 1

    if not payload.get("ok"):
        print("Telegram rejected the request.", file=sys.stderr)
        return 1

    print("Telegram command menu cleared.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
