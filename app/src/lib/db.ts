import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

/**
 * Lazy singleton for the kit's SQLite database.
 *
 * - Resolves the absolute path via the Rust-side `resolve_db_path` command
 *   (honors `RELATIONSHIP_OS_DB_PATH` and falls back to kit-folder discovery).
 * - Connects via `@tauri-apps/plugin-sql`.
 * - Runs `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` once on
 *   first connect — these PRAGMAs are sticky for the database file, so
 *   subsequent opens (including by Hermes) will also be WAL.
 */

let dbPromise: Promise<Database> | null = null;
let resolvedPath: string | null = null;

/**
 * Drop the cached connection — used after the user picks a new kit folder
 * via the first-run flow. The next `getDb()` call will re-resolve and
 * re-open against the new path.
 */
export function resetDbConnection(): void {
  // We intentionally don't await db.close() — Tauri's plugin-sql leaks
  // connections on hot reload too; this is acceptable for a once-per-session
  // path swap.
  dbPromise = null;
  resolvedPath = null;
}

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const path = await invoke<string>("resolve_db_path");
      resolvedPath = path;
      const db = await Database.load(`sqlite:${path}`);
      // WAL mode allows one writer + many readers across the app + Hermes.
      // foreign_keys is forward-compatible: we don't declare FKs in the
      // current schema, but enabling now lets a future migration add them
      // without surprise.
      // busy_timeout makes the connection wait up to 5s for another writer
      // (Hermes or the kit CLI) to release the write lock before throwing
      // "database is locked". Without it, Settings → Deliverable Scheme
      // and other contention-prone writes fail instantly.
      await db.execute("PRAGMA journal_mode = WAL");
      await db.execute("PRAGMA foreign_keys = ON");
      await db.execute("PRAGMA busy_timeout = 5000");
      return db;
    })();
    // If the promise rejects, allow callers to retry.
    dbPromise.catch(() => {
      dbPromise = null;
      resolvedPath = null;
    });
  }
  return dbPromise;
}

export function getResolvedDbPath(): string | null {
  return resolvedPath;
}

export interface TableCount {
  table: string;
  label: string;
  count: number;
}

/**
 * Tables shown on the home screen smoke test. Order matches the kickoff's
 * "Contacts / Touchpoints / Reminders / Daily Focus / Settings / Events"
 * expectation so the row counts read top-to-bottom against the spec.
 */
export const SMOKE_TEST_TABLES: { table: string; label: string }[] = [
  { table: "contacts", label: "Contacts" },
  { table: "touchpoints", label: "Touchpoints" },
  { table: "reminders", label: "Reminders" },
  { table: "daily_focus", label: "Daily Focus" },
  { table: "settings", label: "Settings" },
  { table: "events", label: "Events" },
];

export async function fetchTableCounts(): Promise<TableCount[]> {
  const db = await getDb();
  const counts: TableCount[] = [];
  for (const { table, label } of SMOKE_TEST_TABLES) {
    // Identifiers are interpolated (whitelisted) because SQLite doesn't
    // parametrize table names — but the list is a hard-coded constant
    // above, so this is not user input.
    const rows = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM "${table}"`
    );
    counts.push({ table, label, count: rows[0]?.n ?? 0 });
  }
  return counts;
}
