"""Concurrent-writer soak test.

Spawns two Python subprocesses that both write touchpoints to the same
SQLite database simultaneously. Verifies the SCOPING.md acceptance
criteria #4: "Concurrent app and Hermes writes do not corrupt the
database."

This is the test the architecture was always supposed to have but
didn't (per the eng review). It exercises the WAL + busy_timeout path
that scripts/relationship_os.py:SQLiteStore.connect() now sets up.

Runtime: ~15-30 seconds depending on Python startup. Each worker does N
writes; the test asserts no "database is locked" errors surfaced and
all rows landed.
"""

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "relationship_os.py"

WRITES_PER_WORKER = 10
WORKERS = 3


def base_env(db_path: Path, local_dir: Path):
    env = os.environ.copy()
    env["RELATIONSHIP_OS_STORE"] = "sqlite"
    env["RELATIONSHIP_OS_DB_PATH"] = str(db_path)
    env["RELATIONSHIP_OS_CONSULTANT_VIEW"] = "csv"
    env["RELATIONSHIP_OS_LOCAL_DIR"] = str(local_dir)
    return env


def run_cli(args, env):
    """Run the kit CLI and return (returncode, stdout, stderr)."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--env", str(ROOT / ".env.example"), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env=env,
    )
    return proc.returncode, proc.stdout, proc.stderr


def worker(worker_id: int, env: dict, contact_name: str):
    """Write WRITES_PER_WORKER touchpoints for one contact."""
    failures = []
    for i in range(WRITES_PER_WORKER):
        payload = {
            "contact_name": contact_name,
            "touch_date": "2026-05-20",
            "touchpoint_type": "coffee",
            "sentiment": "positive",
            "summary": f"Worker {worker_id} write {i}",
            "raw_input": f"Worker {worker_id} write {i}",
            "topics": ["soak-test"],
            "action_items": "",
            "contact_type": "prospect",
            "relationship_stage": "warm",
        }
        # Write payload to a temp file the CLI reads via --json-file.
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as f:
            json.dump(payload, f)
            payload_path = f.name
        try:
            rc, _stdout, stderr = run_cli(
                ["--format=json", "log-touchpoint", "--json-file", payload_path],
                env,
            )
            if rc != 0:
                failures.append(
                    f"worker {worker_id} write {i}: rc={rc} stderr={stderr.strip()}"
                )
        finally:
            try:
                os.unlink(payload_path)
            except OSError:
                pass
    return failures


class ConcurrentWritesTest(unittest.TestCase):
    """SCOPING.md acceptance criteria #4: concurrent writers don't corrupt DB."""

    def test_two_workers_no_database_locked_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db_path = tmp_path / "relationship_os.sqlite3"
            local_dir = tmp_path / "local_sheet"

            # Seed two contacts so the workers don't fight over the same
            # contact_id resolution path.
            seed_env = base_env(db_path, local_dir)
            rc, _stdout, stderr = run_cli(["init"], seed_env)
            self.assertEqual(rc, 0, f"init failed: {stderr}")

            # Run two workers concurrently against the same DB.
            with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                futures = [
                    pool.submit(
                        worker,
                        worker_id=w,
                        env=base_env(db_path, local_dir),
                        contact_name=f"Soak Contact {w}",
                    )
                    for w in range(WORKERS)
                ]
                all_failures = []
                for fut in as_completed(futures):
                    all_failures.extend(fut.result())

            # No subprocess should have hit "database is locked" or any
            # other non-zero exit. The 5s busy_timeout + WAL mode should
            # absorb the contention.
            self.assertEqual(
                all_failures,
                [],
                f"{len(all_failures)} concurrent-write failures:\n"
                + "\n".join(all_failures),
            )

            # Verify every expected row landed. WORKERS * WRITES_PER_WORKER
            # touchpoints + one Contact per worker (the workers use distinct
            # contact names).
            with sqlite3.connect(db_path) as conn:
                touchpoint_count = conn.execute(
                    "SELECT COUNT(*) FROM touchpoints"
                ).fetchone()[0]
                contact_count = conn.execute(
                    "SELECT COUNT(*) FROM contacts"
                ).fetchone()[0]
                journal_mode = conn.execute(
                    "PRAGMA journal_mode"
                ).fetchone()[0]

            expected_touchpoints = WORKERS * WRITES_PER_WORKER
            self.assertEqual(
                touchpoint_count,
                expected_touchpoints,
                f"expected {expected_touchpoints} touchpoints, got {touchpoint_count}",
            )
            self.assertEqual(
                contact_count, WORKERS, f"expected {WORKERS} contacts, got {contact_count}"
            )
            # The WAL+FK fix from the eng review: the DB should be in WAL
            # mode after any kit connection has run.
            self.assertEqual(
                journal_mode.lower(),
                "wal",
                f"DB should be in WAL mode, got {journal_mode}",
            )


if __name__ == "__main__":
    unittest.main()
