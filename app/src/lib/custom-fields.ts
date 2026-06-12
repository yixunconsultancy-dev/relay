/**
 * Custom fields helpers.
 *
 * Custom fields are stored as a JSON object in contacts.custom_fields
 * (e.g. `{"Annual Income": "80000", "Risk Appetite": "Moderate"}`).
 *
 * All writes go directly to SQLite — no Python subprocess needed, since
 * custom fields have no business-logic validation.
 */

import { getDb } from "@/lib/db";

export type CustomFields = Record<string, string>;

/** Safely parse the raw JSON string from the DB. Returns {} on any error. */
export function parseCustomFields(raw: string | null | undefined): CustomFields {
  if (!raw || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as CustomFields;
    }
  } catch {
    // malformed — return empty
  }
  return {};
}

/** Persist a full custom-fields map back to the contacts table. */
export async function saveCustomFields(
  contactId: string,
  fields: CustomFields
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE contacts SET custom_fields = $1, updated_at = $2 WHERE id = $3`,
    [JSON.stringify(fields), now, contactId]
  );
}

/**
 * Add a new key (with an empty value) to every active contact that doesn't
 * already have it. Contacts that already have the key are untouched so
 * existing data is never overwritten.
 *
 * Returns the number of contacts that were updated.
 */
export async function propagateFieldToAllContacts(key: string): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();

  // Read all active (non-deleted) contacts.
  const rows = await db.select<{ id: string; custom_fields: string }[]>(
    `SELECT id, custom_fields FROM contacts
      WHERE (deleted_at IS NULL OR deleted_at = '')
        AND (archived_at IS NULL OR archived_at = '')`
  );

  let updated = 0;
  for (const row of rows) {
    const fields = parseCustomFields(row.custom_fields);
    if (key in fields) continue;          // already has the key — leave it alone
    fields[key] = "";
    await db.execute(
      `UPDATE contacts SET custom_fields = $1, updated_at = $2 WHERE id = $3`,
      [JSON.stringify(fields), now, row.id]
    );
    updated++;
  }
  return updated;
}
