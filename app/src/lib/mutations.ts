// Write helpers used by the app.
//
// - `updateContact` shells out to the Python kit's `update-contact` command
//   via `run_kit_command`. The kit owns the validation (CONSULTANT_MANAGED_FIELDS
//   vs HERMES_MANAGED_FIELDS, append-by-default for free-text, atomic for
//   facts), the diff computation, the `contact_updated` event INSERT, and
//   the consultant-view sync. The app passes `source: "app:edit-contact"`
//   so the Settings "last Hermes event" view keeps excluding app edits.
// - `updateTouchpointNotes` writes directly to SQLite because the kit does
//   not expose a touchpoint-notes endpoint — touchpoint annotations are a
//   private app-local concern, deliberately unaudited (see policy note
//   below).
//
// ---- Events / audit policy ----
//
// VALID_EVENT_KINDS in the Python kit covers the writes that another peer
// writer (Hermes, the CLI) cares about: touchpoint_logged, reminder_*,
// contact_created, contact_updated, contact_archived, contact_unarchived,
// contact_renamed, contact_merged, reminder_duplicate_skipped, policy_*.
//
// The app emits one of these only when it changes data another process
// might care about. Specifically:
//
//   - contact_updated -> emitted by the kit when the app shells out below.
//     Source = "app:edit-contact" so the Hermes-status query can exclude it.
//   - touchpoint_logged / reminder_* / policy_* -> the Python kit emits
//     these for us when the app shells out via run_kit_command.
//
// The following app-initiated writes are deliberately NOT audited:
//
//   - daily_focus rows (routes/daily-focus.tsx): consultant's private
//     journal, single-writer, never touched by Hermes/CLI.
//   - settings rows (routes/settings.tsx): per-machine UI preferences.
//   - touchpoints.notes column (routes/touchpoint-detail.tsx): personal
//     annotation on an existing touchpoint, not part of the kit's
//     touchpoint contract. Writes are still centralized below so the
//     8,000-character guard and missing-row check stay enforced.

import { getDb } from "@/lib/db";
import { updateContactBatch } from "@/lib/kit";
import type { ContactRow, EditableContactField } from "@/lib/schema";

export const MAX_TOUCHPOINT_NOTE_LENGTH = 8000;

/** ISO timestamp without microseconds, matching the Python kit's now_iso().
 *  Still used by routes/daily-focus.tsx for the local-only daily_focus rows. */
export function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export interface UpdateContactInput {
  id: string;
  changes: Partial<Pick<ContactRow, EditableContactField>>;
}

export interface UpdateContactResult {
  ok: true;
  changedFields: EditableContactField[];
  message: string;
}

/**
 * Update consultant-managed fields on a contact. Shells out to the Python
 * kit's `update-contact` command so validation, diff computation, event
 * logging, and view sync all happen in one place.
 *
 * Returns the names of fields that actually changed (empty if every
 * proposed value matched the existing one).
 */
export async function updateContact(
  input: UpdateContactInput
): Promise<UpdateContactResult> {
  // Stringify all values — the kit treats fields as text. Filter out
  // undefined entries so we never overwrite a real value with empty.
  const updates: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.changes)) {
    if (v === undefined) continue;
    updates[k] = String(v ?? "");
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true, changedFields: [], message: "No changes proposed." };
  }

  const result = await updateContactBatch(input.id, updates, {
    source: "app:edit-contact",
  });

  return {
    ok: true,
    changedFields: Object.keys(result.diff) as EditableContactField[],
    message: result.message,
  };
}

export interface TouchpointEdits {
  date?: string;
  type?: string;
  sentiment?: string;
  summary?: string;
  topics?: string;
  action_items?: string;
}

/**
 * Update the editable content fields of an existing touchpoint.
 * `created_at` is never modified — the original log time is preserved.
 */
export async function updateTouchpoint(
  id: string,
  edits: TouchpointEdits
): Promise<void> {
  const cleanId = id.trim();
  if (!cleanId) throw new Error("Missing touchpoint id.");

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (edits.date !== undefined)         { setClauses.push(`"date" = $${idx++}`);         params.push(edits.date); }
  if (edits.type !== undefined)         { setClauses.push(`"type" = $${idx++}`);         params.push(edits.type); }
  if (edits.sentiment !== undefined)    { setClauses.push(`"sentiment" = $${idx++}`);    params.push(edits.sentiment); }
  if (edits.summary !== undefined)      { setClauses.push(`"summary" = $${idx++}`);      params.push(edits.summary); }
  if (edits.topics !== undefined)       { setClauses.push(`"topics" = $${idx++}`);       params.push(edits.topics); }
  if (edits.action_items !== undefined) { setClauses.push(`"action_items" = $${idx++}`); params.push(edits.action_items); }

  if (setClauses.length === 0) return;
  params.push(cleanId);

  const db = await getDb();
  const result = await db.execute(
    `UPDATE touchpoints SET ${setClauses.join(", ")} WHERE id = $${idx}`,
    params
  );
  if (result.rowsAffected === 0) {
    throw new Error(`Touchpoint ${cleanId} not found.`);
  }
}

export async function updateTouchpointNotes(
  id: string,
  notes: string
): Promise<void> {
  const cleanId = id.trim();
  if (!cleanId) throw new Error("Missing touchpoint id.");
  if (notes.length > MAX_TOUCHPOINT_NOTE_LENGTH) {
    throw new Error(
      `Touchpoint notes must be ${MAX_TOUCHPOINT_NOTE_LENGTH.toLocaleString()} characters or fewer.`
    );
  }

  const db = await getDb();
  const result = await db.execute(
    `UPDATE touchpoints SET "notes" = $1 WHERE id = $2`,
    [notes, cleanId]
  );
  if (result.rowsAffected === 0) {
    throw new Error(`Touchpoint ${cleanId} not found.`);
  }
}
