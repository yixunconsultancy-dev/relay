#!/usr/bin/env python3
"""Interactive one-shot utility to deduplicate pending reminders.

Finds clusters of pending reminders for the same contact whose due dates are
within ±7 days and whose context strings share ≥0.5 Jaccard overlap. Asks the
consultant which one to keep; cancels the rest via the existing reminder
lifecycle, emitting `reminder_cancelled` events with source
`cleanup-duplicates` so the audit trail is preserved.

Dry-run by default. Pass --apply to actually cancel.

Safe to re-run: if no clusters remain, exits with "nothing to do."

Usage:
    python3 scripts/cleanup_duplicate_reminders.py [--env <.env>] [--apply]
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List


def load_kit_module():
    spec = importlib.util.spec_from_file_location(
        "relationship_os_cleanup",
        Path(__file__).resolve().parent / "relationship_os.py",
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    # Register in sys.modules first — Python 3.14's @dataclass introspection
    # looks up sys.modules[cls.__module__] during decoration, and gets None if
    # the module hasn't been registered yet.
    sys.modules["relationship_os_cleanup"] = module
    spec.loader.exec_module(module)
    return module


def cluster_duplicates(kit, reminders: List[Dict[str, str]]) -> List[List[Dict[str, str]]]:
    """Group pending reminders into duplicate clusters per kit's heuristic."""
    by_contact: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    for row in reminders:
        if (row.get("status") or "pending") != "pending":
            continue
        cid = row.get("contact_id") or ""
        if not cid:
            continue
        by_contact[cid].append(row)

    clusters: List[List[Dict[str, str]]] = []
    for cid, rows in by_contact.items():
        unassigned = list(rows)
        while unassigned:
            seed = unassigned.pop(0)
            cluster = [seed]
            seed_due = kit.parse_iso_date(seed.get("due_date") or "")
            seed_ctx = seed.get("context") or ""
            if not seed_due:
                continue
            remaining: List[Dict[str, str]] = []
            for r in unassigned:
                r_due = kit.parse_iso_date(r.get("due_date") or "")
                if not r_due:
                    remaining.append(r)
                    continue
                if abs((r_due - seed_due).days) <= 7 and kit.context_similarity(seed_ctx, r.get("context") or "") >= 0.5:
                    cluster.append(r)
                else:
                    remaining.append(r)
            unassigned = remaining
            if len(cluster) > 1:
                clusters.append(cluster)
    return clusters


def render_cluster(cluster: List[Dict[str, str]]) -> str:
    name = cluster[0].get("contact_name") or "(unknown)"
    lines = [f"Contact: {name}"]
    for i, row in enumerate(cluster, start=1):
        lines.append(
            f"  [{i}] {row.get('id')}  due={row.get('due_date') or '—'}  "
            f"prio={row.get('priority') or '—'}  type={row.get('type') or '—'}  "
            f"created={row.get('created_at') or '—'}"
        )
        ctx = (row.get("context") or "").strip()
        if ctx:
            lines.append(f"      context: {ctx}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", default=".env", help="Path to dotenv file.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually cancel duplicates. Default is dry-run.",
    )
    parser.add_argument(
        "--keep-newest",
        action="store_true",
        help="Skip the interactive prompt and auto-keep the newest reminder in each cluster.",
    )
    args = parser.parse_args(argv)

    kit = load_kit_module()
    kit.load_env(Path(args.env).expanduser())
    store = kit.get_store()
    store.ensure()

    reminders = store.read(kit.REMINDERS)
    clusters = cluster_duplicates(kit, reminders)
    if not clusters:
        print("No duplicate reminder clusters found. Nothing to do.")
        return 0

    print(f"Found {len(clusters)} duplicate cluster(s):\n")
    cancelled_total = 0
    for ci, cluster in enumerate(clusters, start=1):
        print(f"--- Cluster {ci}/{len(clusters)} ---")
        print(render_cluster(cluster))
        if args.keep_newest:
            sorted_by_created = sorted(
                cluster, key=lambda r: r.get("created_at") or "", reverse=True
            )
            keep = sorted_by_created[0]
            print(f"  auto-keep newest: {keep.get('id')}")
            chosen_index = cluster.index(keep) + 1
        else:
            while True:
                choice = input(
                    f"  Keep which? [1-{len(cluster)} / s=skip cluster]: "
                ).strip().lower()
                if choice == "s":
                    chosen_index = None
                    break
                if choice.isdigit() and 1 <= int(choice) <= len(cluster):
                    chosen_index = int(choice)
                    break
                print("  invalid choice")
        if chosen_index is None:
            print("  skipped")
            continue

        for i, row in enumerate(cluster, start=1):
            if i == chosen_index:
                continue
            rid = row.get("id") or ""
            if not args.apply:
                print(f"  [dry-run] would cancel {rid}")
                continue
            try:
                kit.mark_reminder_status(store, rid, "cancelled")
                kit.log_event(
                    store,
                    "reminder_cancelled",
                    contact_id=row.get("contact_id") or "",
                    subject_id=rid,
                    payload={
                        "context": row.get("context") or "",
                        "cancelled_by": "cleanup-duplicates",
                        "kept_reminder_id": cluster[chosen_index - 1].get("id"),
                    },
                    source="cleanup-duplicates",
                )
                cancelled_total += 1
                print(f"  cancelled {rid}")
            except kit.RelationshipOSError as exc:
                print(f"  ERROR cancelling {rid}: {exc}", file=sys.stderr)
        print()

    if args.apply:
        kit.sync_consultant_views(store)
        print(f"Done. Cancelled {cancelled_total} reminder(s).")
    else:
        print("Dry run complete. Re-run with --apply to actually cancel.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
