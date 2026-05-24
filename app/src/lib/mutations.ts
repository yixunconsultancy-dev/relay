// Write helpers that go directly to SQLite from the app side.
//
// For writes that need the kit's validation (touchpoints, reminder lifecycle),
// we shell out via the `run_kit_command` Tauri command — see lib/kit.ts.
// For simple consultant-managed field edits on contacts (Phase 3) we write
// directly here, then append a `contact_updated` event so Hermes can see
// the change on its next poll.
//
// ---- Events / audit policy ----
//
// Not every app-initiated write goes into the events table. The kit's
// VALID_EVENT_KINDS covers the writes that another peer writer (Hermes,
// the CLI) cares about:
//
//   touchpoint_logged, reminder_completed, reminder_snoozed,
//   reminder_cancelled, contact_created, contact_updated.
//
// The app emits one of these only when it changes data that another
// process might care about. Specifically:
//
//   - contact_updated -> emitted (see `updateContact` below). Sourced as
//     `app:edit-contact` so the Hermes-status query can exclude it.
//   - touchpoint_logged / reminder_* -> the Python CLI emits these for us
//     when the app shells out via `run_kit_command`.
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
//
// If any of these later need to participate in cross-process polling,
// extend VALID_EVENT_KINDS in scripts/relationship_os.py first, then
// add the matching INSERT here.

import { getDb } from "@/lib/db";
import { fetchContact } from "@/lib/queries";
import type { EventKind } from "@/lib/enums";
import type { ContactRow, EditableContactField } from "@/lib/schema";
import { EDITABLE_CONTACT_FIELDS } from "@/lib/schema";

export const MAX_TOUCHPOINT_NOTE_LENGTH = 8000;

/** ISO timestamp without microseconds, matching the Python kit's now_iso(). */
export function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Match make_id("e") in scripts/relationship_os.py: e_YYYYMMDD_xxxx (4 hex). */
export function makeId(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  // 16 bits of randomness, hex-encoded — equivalent to uuid4().hex[:4].
  const rand = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
  return `${prefix}_${datePart}_${rand}`;
}

export interface UpdateContactInput {
  id: string;
  changes: Partial<Pick<ContactRow, EditableContactField>>;
}

export interface UpdateContactResult {
  ok: true;
  eventId: string | null;
  changedFields: EditableContactField[];
}

/**
 * Update consultant-managed fields on a contact + append a contact_updated
 * event with a diff payload. Hermes-managed fields are ignored if passed.
 *
 * The update + event INSERT run inside a single SQLite transaction so they
 * commit (or fail) together.
 */
export async function updateContact(
  input: UpdateContactInput
): Promise<UpdateContactResult> {
  const previous = await fetchContact(input.id);
  if (!previous) {
    throw new Error(`Contact ${input.id} not found.`);
  }

  // Diff: only keep editable fields that changed.
  const diff: Record<string, { from: string; to: string }> = {};
  const setClauses: string[] = [];
  const values: unknown[] = [];
  const editable = new Set<EditableContactField>(EDITABLE_CONTACT_FIELDS);
  for (const [k, v] of Object.entries(input.changes)) {
    if (!editable.has(k as EditableContactField)) continue;
    const next = (v ?? "").toString();
    const prev = (previous[k as keyof ContactRow] ?? "").toString();
    if (next === prev) continue;
    diff[k] = { from: prev, to: next };
    setClauses.push(`"${k}" = $${values.length + 1}`);
    values.push(next);
  }

  if (setClauses.length === 0) {
    return { ok: true, eventId: null, changedFields: [] };
  }

  // Always bump updated_at so Hermes sees a fresh row.
  const updatedAt = nowIso();
  setClauses.push(`"updated_at" = $${values.length + 1}`);
  values.push(updatedAt);

  const eventId = makeId("e");
  const eventPayload = JSON.stringify({
    diff,
    field_count: Object.keys(diff).length,
  });

  const db = await getDb();
  try {
    await db.execute("BEGIN");
    await db.execute(
      `UPDATE contacts SET ${setClauses.join(", ")} WHERE id = $${values.length + 1}`,
      [...values, input.id]
    );
    await db.execute(
      `INSERT INTO events ("id","timestamp","kind","contact_id","subject_id","payload","source")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [eventId, updatedAt, "contact_updated" satisfies EventKind, input.id, input.id, eventPayload, "app:edit-contact"]
    );
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK").catch(() => undefined);
    throw e;
  }

  return {
    ok: true,
    eventId,
    changedFields: Object.keys(diff) as EditableContactField[],
  };
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
