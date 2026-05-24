#!/usr/bin/env python3
"""Retag prior bulk-import touchpoints as `import` and recompute last_touch_date.

Live test 2 ran a 64-row .xlsx import that used `log-touchpoint` with
touchpoint_type='other' as a workaround (no add-contact existed yet). Those
touchpoints polluted the consultant's "last_touch_date" signal, making
imported contacts look freshly touched today and dragging the cooling/at-risk
calculator off.

This utility:
- Finds touchpoints whose summary or raw_input matches an import-signature
  pattern (configurable; default catches "Imported client contact from"),
- Retags them as touchpoint_type='import' (the new dedicated non-interaction
  type),
- For each affected contact, recomputes last_touch_date as the most recent
  REAL-interaction touchpoint date (or blank if there are none).

Dry-run by default. Pass --apply to commit.

Usage:
    python3 scripts/cleanup_import_touchpoints.py [--env .env] [--apply] \
        [--pattern "Imported client contact"]
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path
from typing import List


def load_kit_module():
    spec = importlib.util.spec_from_file_location(
        "relationship_os_import_cleanup",
        Path(__file__).resolve().parent / "relationship_os.py",
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["relationship_os_import_cleanup"] = module
    spec.loader.exec_module(module)
    return module


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", default=".env", help="Path to dotenv file.")
    parser.add_argument(
        "--pattern",
        default="Imported client contact",
        help="Case-insensitive substring matched against touchpoint summary / raw_input.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually retag and recompute. Default is dry-run.",
    )
    args = parser.parse_args(argv)

    kit = load_kit_module()
    kit.load_env(Path(args.env).expanduser())
    store = kit.get_store()
    store.ensure()

    touchpoint_rows = store.read(kit.TOUCHPOINTS)
    needle = args.pattern.lower()
    affected_ids = set()
    retagged_touchpoints = 0

    for row in touchpoint_rows:
        if (row.get("type") or "") == "import":
            continue  # already retagged on a prior run
        haystack = ((row.get("summary") or "") + " " + (row.get("raw_input") or "")).lower()
        if needle not in haystack:
            continue
        retagged_touchpoints += 1
        affected_ids.add(row.get("contact_id") or "")
        if args.apply:
            row["type"] = "import"

    if retagged_touchpoints == 0:
        print(f"No touchpoints match pattern {args.pattern!r}. Nothing to do.")
        return 0

    print(f"{'Would retag' if not args.apply else 'Retagged'} {retagged_touchpoints} touchpoint(s) as 'import'.")
    print(f"Affected contacts: {len(affected_ids)}")

    # Recompute last_touch_date for affected contacts.
    if not args.apply:
        # Show what the new last_touch_date would be without writing.
        contact_rows = store.read(kit.CONTACTS)
        for cid in sorted(affected_ids):
            real_dates = sorted(
                (
                    (r.get("date") or "")
                    for r in touchpoint_rows
                    if r.get("contact_id") == cid
                    and (r.get("type") or "") in kit.REAL_INTERACTION_TOUCHPOINT_TYPES
                ),
                reverse=True,
            )
            new_last = real_dates[0] if real_dates else ""
            current = next((c.get("last_touch_date") or "" for c in contact_rows if c.get("id") == cid), "")
            name = next((c.get("name") or "" for c in contact_rows if c.get("id") == cid), "")
            if current != new_last:
                print(
                    f"  [dry-run] {name or cid}: last_touch_date {current!r} -> {new_last!r}"
                )
        print("Dry run complete. Re-run with --apply to commit.")
        return 0

    # Apply mode: write retagged touchpoints back, then recompute + write contacts.
    store.replace(kit.TOUCHPOINTS, touchpoint_rows)

    contact_rows = store.read(kit.CONTACTS)
    contact_updates = 0
    for cid in affected_ids:
        real_dates = sorted(
            (
                (r.get("date") or "")
                for r in touchpoint_rows
                if r.get("contact_id") == cid
                and (r.get("type") or "") in kit.REAL_INTERACTION_TOUCHPOINT_TYPES
            ),
            reverse=True,
        )
        new_last = real_dates[0] if real_dates else ""
        for row in contact_rows:
            if row.get("id") != cid:
                continue
            current = row.get("last_touch_date") or ""
            if current != new_last:
                row["last_touch_date"] = new_last
                row["updated_at"] = kit.now_iso()
                contact_updates += 1
            break
    if contact_updates:
        store.replace(kit.CONTACTS, contact_rows)
    print(f"Updated last_touch_date on {contact_updates} contact(s).")

    kit.sync_consultant_views(store)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
