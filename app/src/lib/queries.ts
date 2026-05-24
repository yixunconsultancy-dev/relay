// TanStack Query hooks that wrap raw SQL against the kit's SQLite database.
//
// Each query has a stable key shape so the events poller (Phase 5) can
// invalidate them surgically.

import { useQuery } from "@tanstack/react-query";

import { getDb } from "@/lib/db";
import type {
  ContactRow,
  TouchpointRow,
  ReminderRow,
  DailyFocusRow,
  SettingRow,
  EventRow,
  PolicyRow,
} from "@/lib/schema";

const ALL_CONTACT_COLS =
  '"id","name","type","relationship_stage","phone","email","occupation","company","birthday","family","policies","financial_concerns","interests","referral_source","next_review_date","last_touch_date","notes","archived_at","created_at","updated_at"';

const ALL_TOUCHPOINT_COLS =
  '"id","contact_id","contact_name","date","type","sentiment","summary","topics","action_items","meeting_number","raw_input","notes","created_at"';

const ALL_REMINDER_COLS =
  '"id","contact_id","contact_name","due_date","type","priority","context","status","snoozed_until","source_touchpoint_id","created_at","completed_at"';

export const queryKeys = {
  contacts: ["contacts"] as const,
  contact: (id: string) => ["contacts", id] as const,
  touchpoints: ["touchpoints"] as const,
  touchpointsByContact: (contactId: string) =>
    ["touchpoints", "by-contact", contactId] as const,
  touchpoint: (id: string) => ["touchpoints", id] as const,
  reminders: ["reminders"] as const,
  remindersByContact: (contactId: string) =>
    ["reminders", "by-contact", contactId] as const,
  policies: ["policies"] as const,
  policiesByContact: (contactId: string) =>
    ["policies", "by-contact", contactId] as const,
  dailyFocus: (date: string) => ["daily-focus", date] as const,
  settings: ["settings"] as const,
  eventsSince: (sinceSeq: number | null) =>
    ["events", "since", sinceSeq ?? 0] as const,
};

const EMPTY_POLICY_ROW: PolicyRow = {
  id: "",
  contact_id: "",
  insurer: "",
  plan_name: "",
  policy_type: "",
  policy_number: "",
  sum_assured: "",
  premium_amount: "",
  premium_frequency: "",
  premium_term: "",
  policy_term: "",
  payment_method: "",
  start_date: "",
  review_date: "",
  review_frequency: "",
  last_reviewed: "",
  current_value: "",
  valuation_date: "",
  surrender_value: "",
  policy_owner: "",
  life_assured: "",
  payor: "",
  beneficiaries: "",
  riders: "",
  servicing_rep: "",
  needs_category: "",
  status: "",
  notes: "",
  created_at: "",
  updated_at: "",
};

function normalizePolicyRow(row: Partial<PolicyRow>): PolicyRow {
  return { ...EMPTY_POLICY_ROW, ...row };
}

export async function fetchContacts(): Promise<ContactRow[]> {
  const db = await getDb();
  return db.select<ContactRow[]>(
    `SELECT ${ALL_CONTACT_COLS} FROM contacts ORDER BY name COLLATE NOCASE ASC`
  );
}

export async function fetchContact(id: string): Promise<ContactRow | null> {
  const db = await getDb();
  const rows = await db.select<ContactRow[]>(
    `SELECT ${ALL_CONTACT_COLS} FROM contacts WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function fetchTouchpointsByContact(
  contactId: string
): Promise<TouchpointRow[]> {
  const db = await getDb();
  return db.select<TouchpointRow[]>(
    `SELECT ${ALL_TOUCHPOINT_COLS}
       FROM touchpoints
      WHERE contact_id = $1
      ORDER BY date DESC, created_at DESC`,
    [contactId]
  );
}

export async function fetchTouchpoint(id: string): Promise<TouchpointRow | null> {
  const db = await getDb();
  const rows = await db.select<TouchpointRow[]>(
    `SELECT ${ALL_TOUCHPOINT_COLS} FROM touchpoints WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function fetchRemindersByContact(
  contactId: string
): Promise<ReminderRow[]> {
  const db = await getDb();
  return db.select<ReminderRow[]>(
    `SELECT ${ALL_REMINDER_COLS}
       FROM reminders
      WHERE contact_id = $1
      ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'snoozed' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
        due_date ASC`,
    [contactId]
  );
}

export async function fetchAllReminders(): Promise<ReminderRow[]> {
  const db = await getDb();
  return db.select<ReminderRow[]>(
    `SELECT ${ALL_REMINDER_COLS}
       FROM reminders
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
        due_date ASC`
  );
}

export async function fetchPendingReminderCountByContact(): Promise<
  Record<string, number>
> {
  const db = await getDb();
  const rows = await db.select<{ contact_id: string; n: number }[]>(
    `SELECT contact_id, COUNT(*) AS n
       FROM reminders
      WHERE status = 'pending'
      GROUP BY contact_id`
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.contact_id] = r.n;
  return out;
}

export async function fetchSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<SettingRow[]>(
    `SELECT "key","value" FROM settings`
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function fetchDailyFocus(
  date: string
): Promise<DailyFocusRow | null> {
  const db = await getDb();
  const rows = await db.select<DailyFocusRow[]>(
    `SELECT "date","priority_1","priority_2","priority_3","follow_ups_due","reflection","bottlenecks","created_at"
       FROM daily_focus WHERE date = $1 LIMIT 1`,
    [date]
  );
  return rows[0] ?? null;
}

// Polls the events table for new rows since the cursor. Cursor is SQLite's
// monotonic `rowid`, NOT the public `id` column — event ids are
// `e_YYYYMMDD_<random4>` and do not sort monotonically, so an id-based
// cursor could miss newer events whose random suffix sorts behind the
// previous high-water mark. `rowid` is unquoted because the table is not
// WITHOUT ROWID, so SQLite resolves the keyword to the implicit row id.
const EVENT_COLS =
  'rowid AS rowid, "id","timestamp","kind","contact_id","subject_id","payload","source"';

export async function fetchEventsSince(sinceSeq: number | null): Promise<EventRow[]> {
  const db = await getDb();
  if (sinceSeq === null) {
    return db.select<EventRow[]>(
      `SELECT ${EVENT_COLS} FROM events ORDER BY rowid ASC`
    );
  }
  return db.select<EventRow[]>(
    `SELECT ${EVENT_COLS} FROM events WHERE rowid > $1 ORDER BY rowid ASC`,
    [sinceSeq]
  );
}

export async function fetchLatestEventSeq(): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ seq: number | null }[]>(
    `SELECT MAX(rowid) AS seq FROM events`
  );
  const seq = rows[0]?.seq;
  return typeof seq === "number" ? seq : null;
}

export interface ActivityFilters {
  kind?: string;
  source?: string;
  contactId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export async function fetchActivityEvents(
  filters: ActivityFilters = {}
): Promise<EventRow[]> {
  const db = await getDb();
  const where: string[] = [];
  const args: unknown[] = [];
  function placeholder(value: unknown): string {
    args.push(value);
    return `$${args.length}`;
  }
  if (filters.kind) where.push(`kind = ${placeholder(filters.kind)}`);
  if (filters.source) where.push(`source = ${placeholder(filters.source)}`);
  if (filters.contactId) where.push(`contact_id = ${placeholder(filters.contactId)}`);
  if (filters.since) where.push(`timestamp >= ${placeholder(filters.since)}`);
  if (filters.until) where.push(`timestamp <= ${placeholder(filters.until + "T23:59:59")}`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.max(1, filters.limit ?? 200);
  args.push(limit);
  const limitParam = `$${args.length}`;
  return db.select<EventRow[]>(
    `SELECT ${EVENT_COLS} FROM events ${whereSql} ORDER BY rowid DESC LIMIT ${limitParam}`,
    args
  );
}

export async function fetchLatestExternalEvent(): Promise<EventRow | null> {
  const db = await getDb();
  const rows = await db.select<EventRow[]>(
    `SELECT ${EVENT_COLS}
       FROM events
      WHERE COALESCE(source, '') <> ''
        AND source NOT LIKE 'app:%'
      ORDER BY rowid DESC
      LIMIT 1`
  );
  return rows[0] ?? null;
}

// ---- Hooks ----

export function useContacts() {
  return useQuery({ queryKey: queryKeys.contacts, queryFn: fetchContacts });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.contact(id) : ["contacts", "none"],
    queryFn: () => (id ? fetchContact(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useTouchpointsByContact(contactId: string | undefined) {
  return useQuery({
    queryKey: contactId
      ? queryKeys.touchpointsByContact(contactId)
      : ["touchpoints", "none"],
    queryFn: () =>
      contactId ? fetchTouchpointsByContact(contactId) : Promise.resolve([]),
    enabled: Boolean(contactId),
  });
}

export function useRemindersByContact(contactId: string | undefined) {
  return useQuery({
    queryKey: contactId
      ? queryKeys.remindersByContact(contactId)
      : ["reminders", "none"],
    queryFn: () =>
      contactId ? fetchRemindersByContact(contactId) : Promise.resolve([]),
    enabled: Boolean(contactId),
  });
}

export function useAllReminders() {
  return useQuery({ queryKey: queryKeys.reminders, queryFn: fetchAllReminders });
}

export function usePendingReminderCountByContact() {
  return useQuery({
    queryKey: ["reminders", "pending-counts"] as const,
    queryFn: fetchPendingReminderCountByContact,
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
}

export function useTouchpoint(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.touchpoint(id) : ["touchpoints", "none"],
    queryFn: () => (id ? fetchTouchpoint(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export async function fetchPoliciesByContact(
  contactId: string,
  options?: { includeArchived?: boolean }
): Promise<PolicyRow[]> {
  const db = await getDb();
  const rows = await db.select<Partial<PolicyRow>[]>(
    `SELECT *
       FROM policies
      WHERE contact_id = $1
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'lapsed' THEN 1 WHEN 'surrendered' THEN 2 WHEN 'claimed' THEN 3 ELSE 4 END,
        created_at DESC`,
    [contactId]
  );
  const normalized = rows.map(normalizePolicyRow);
  if (options?.includeArchived) return normalized;
  return normalized.filter((r) => (r.status || "active") !== "archived");
}

export function usePoliciesByContact(
  contactId: string | undefined,
  options?: { includeArchived?: boolean }
) {
  return useQuery({
    queryKey: contactId
      ? queryKeys.policiesByContact(contactId)
      : ["policies", "none"],
    queryFn: () =>
      contactId ? fetchPoliciesByContact(contactId, options) : Promise.resolve([]),
    enabled: Boolean(contactId),
  });
}
