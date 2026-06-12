/**
 * App-level migrations — run once on startup via Boot.tsx.
 * Each migration uses CREATE TABLE IF NOT EXISTS / ALTER TABLE … so it is
 * safe to call on every boot without duplicating data.
 */

import { getDb } from "@/lib/db";

export async function runMigrations(): Promise<void> {
  const db = await getDb();

  // ── Journal Entries ──────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      date                        TEXT PRIMARY KEY,
      appointments                INTEGER NOT NULL DEFAULT 0,
      fyc_opened                  REAL    NOT NULL DEFAULT 0,
      fyc_closed                  REAL    NOT NULL DEFAULT 0,
      new_candidate_conversation  INTEGER NOT NULL DEFAULT 0,
      win_challenge               TEXT    NOT NULL DEFAULT '',
      created_at                  TEXT    NOT NULL,
      updated_at                  TEXT    NOT NULL
    )
  `);

  // ── Contacts: deleted_at column (soft-trash) ─────────────────────────────
  // ALTER TABLE … ADD COLUMN has no IF NOT EXISTS in SQLite; wrap in try/catch.
  try {
    await db.execute(
      `ALTER TABLE contacts ADD COLUMN deleted_at TEXT NOT NULL DEFAULT ''`
    );
  } catch {
    // Column already exists — safe to ignore.
  }

  // ── Contacts: custom_fields column (modular key-value metadata) ──────────
  try {
    await db.execute(
      `ALTER TABLE contacts ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}'`
    );
  } catch {
    // Column already exists — safe to ignore.
  }

  // ── Contact Documents ─────────────────────────────────────────────────────
  // Stores metadata for uploaded files (PDFs, Excel, PPTX, DOCX).
  // The actual files live at vault/client_documents/{contact_id}/{file_name}.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS contact_documents (
      id          TEXT    PRIMARY KEY,
      contact_id  TEXT    NOT NULL,
      file_name   TEXT    NOT NULL,
      file_path   TEXT    NOT NULL,
      file_type   TEXT    NOT NULL DEFAULT '',
      file_size   INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT    NOT NULL
    )
  `);

  // ── Policies: investment-tracking columns ────────────────────────────────
  // These power the Investments dashboard. ALTER TABLE … ADD COLUMN has no
  // IF NOT EXISTS in SQLite, so each one is wrapped in try/catch (the column
  // may already exist if Python ran first and seeded it).
  for (const col of [
    "portfolio",
    "portfolio_tag",
    "total_premiums_paid",
    "lock_in_period",
    "lock_in_end_date",
    "premium_holiday_months",
    "product_id",
    "has_nomination",
    // Soft-delete column for the Policies-in-Trash feature. Mirrors the
    // contacts.deleted_at pattern: empty means active, ISO timestamp means
    // discarded and listed on the Trash page.
    "deleted_at",
  ]) {
    try {
      await db.execute(
        `ALTER TABLE policies ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`
      );
    } catch {
      // Column already exists — safe to ignore.
    }
  }

  // ── Investment Products catalog ──────────────────────────────────────────
  // One row per product type (Pro Achiever, Platinum Wealth Venture, etc.).
  // Holds the fixed metadata (premium term, lock-in period) that auto-fills
  // when Jovial creates a new client policy of that product.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS investment_products (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL DEFAULT '',
      premium_term    TEXT NOT NULL DEFAULT '',
      lock_in_period  TEXT NOT NULL DEFAULT '',
      notes           TEXT NOT NULL DEFAULT '',
      archived_at     TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT '',
      updated_at      TEXT NOT NULL DEFAULT ''
    )
  `);
}
