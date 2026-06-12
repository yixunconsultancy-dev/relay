// TanStack Query hooks that wrap raw SQL against the kit's SQLite database.
//
// Each query has a stable key shape so the events poller (Phase 5) can
// invalidate them surgically.

import { useQuery } from "@tanstack/react-query";

import { getDb } from "@/lib/db";
import type {
  ContactRow,
  ContactDocumentRow,
  TouchpointRow,
  ReminderRow,
  DailyFocusRow,
  SettingRow,
  EventRow,
  PolicyRow,
  JournalEntry,
  InvestmentProduct,
} from "@/lib/schema";

// Columns present before the trash + custom-fields migrations.
const ALL_CONTACT_COLS_BASE =
  '"id","name","type","relationship_stage","phone","email","occupation","company","address","birthday","family","policies","financial_concerns","interests","referral_source","next_review_date","last_touch_date","notes","archived_at","created_at","updated_at"';

// Full column list (includes columns added by later migrations).
const ALL_CONTACT_COLS =
  '"id","name","type","relationship_stage","phone","email","occupation","company","address","birthday","family","policies","financial_concerns","interests","referral_source","next_review_date","last_touch_date","notes","archived_at","deleted_at","custom_fields","created_at","updated_at"';

const ALL_TOUCHPOINT_COLS =
  '"id","contact_id","contact_name","date","type","sentiment","summary","topics","action_items","meeting_number","raw_input","notes","created_at"';

const ALL_REMINDER_COLS =
  '"id","contact_id","contact_name","due_date","type","priority","context","status","snoozed_until","source_touchpoint_id","created_at","completed_at"';

export const queryKeys = {
  contacts: ["contacts"] as const,
  contact: (id: string) => ["contacts", id] as const,
  trashedContacts: ["contacts", "trash"] as const,
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
  trashedPolicies: ["policies", "trash"] as const,
  investmentProducts: ["investment-products"] as const,
  documentsByContact: (contactId: string) =>
    ["documents", "by-contact", contactId] as const,
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
  portfolio: "",
  portfolio_tag: "",
  total_premiums_paid: "",
  lock_in_period: "",
  lock_in_end_date: "",
  premium_holiday_months: "",
  product_id: "",
  has_nomination: "",
  deleted_at: "",
  created_at: "",
  updated_at: "",
};

function normalizePolicyRow(row: Partial<PolicyRow>): PolicyRow {
  return { ...EMPTY_POLICY_ROW, ...row };
}

// ── Investment products catalog ────────────────────────────────────────────

const EMPTY_INVESTMENT_PRODUCT: InvestmentProduct = {
  id: "",
  name: "",
  premium_term: "",
  lock_in_period: "",
  notes: "",
  archived_at: "",
  created_at: "",
  updated_at: "",
};

function normalizeInvestmentProduct(row: Partial<InvestmentProduct>): InvestmentProduct {
  return { ...EMPTY_INVESTMENT_PRODUCT, ...row };
}

export async function fetchInvestmentProducts(
  options: { includeArchived?: boolean } = {}
): Promise<InvestmentProduct[]> {
  const db = await getDb();
  try {
    const rows = await db.select<Partial<InvestmentProduct>[]>(
      options.includeArchived
        ? `SELECT * FROM investment_products ORDER BY name COLLATE NOCASE ASC`
        : `SELECT * FROM investment_products
            WHERE (archived_at IS NULL OR archived_at = '')
            ORDER BY name COLLATE NOCASE ASC`
    );
    return rows.map(normalizeInvestmentProduct);
  } catch {
    // Table doesn't exist yet (Python hasn't run, migration hasn't run).
    return [];
  }
}

export async function fetchContacts(): Promise<ContactRow[]> {
  const db = await getDb();
  try {
    // Fast path: trash migration has run, filter out soft-deleted contacts.
    return await db.select<ContactRow[]>(
      `SELECT ${ALL_CONTACT_COLS} FROM contacts
        WHERE (deleted_at IS NULL OR deleted_at = '')
        ORDER BY name COLLATE NOCASE ASC`
    );
  } catch {
    // Fallback: deleted_at column doesn't exist yet — return all contacts with a
    // synthetic empty deleted_at so the rest of the app doesn't break.
    const rows = await db.select<Omit<ContactRow, "deleted_at" | "custom_fields">[]>(
      `SELECT ${ALL_CONTACT_COLS_BASE} FROM contacts
        ORDER BY name COLLATE NOCASE ASC`
    );
    return rows.map((r) => ({ ...r, deleted_at: "", custom_fields: "{}" }));
  }
}

export async function fetchTrashedContacts(): Promise<ContactRow[]> {
  const db = await getDb();
  try {
    return await db.select<ContactRow[]>(
      `SELECT ${ALL_CONTACT_COLS} FROM contacts
        WHERE deleted_at IS NOT NULL AND deleted_at != ''
        ORDER BY deleted_at DESC`
    );
  } catch {
    // Migration hasn't run yet — no trash exists, return empty list.
    return [];
  }
}

export async function fetchDocumentsByContact(
  contactId: string
): Promise<ContactDocumentRow[]> {
  const db = await getDb();
  return db.select<ContactDocumentRow[]>(
    `SELECT id, contact_id, file_name, file_path, file_type, file_size, uploaded_at
       FROM contact_documents
      WHERE contact_id = $1
      ORDER BY uploaded_at DESC`,
    [contactId]
  );
}

export async function fetchContact(id: string): Promise<ContactRow | null> {
  const db = await getDb();
  try {
    const rows = await db.select<ContactRow[]>(
      `SELECT ${ALL_CONTACT_COLS} FROM contacts WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  } catch {
    const rows = await db.select<Omit<ContactRow, "deleted_at" | "custom_fields">[]>(
      `SELECT ${ALL_CONTACT_COLS_BASE} FROM contacts WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ? { ...rows[0], deleted_at: "", custom_fields: "{}" } : null;
  }
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

/** All touchpoints across all contacts. Used by the debt computation. */
export async function fetchAllTouchpoints(): Promise<TouchpointRow[]> {
  const db = await getDb();
  return db.select<TouchpointRow[]>(
    `SELECT ${ALL_TOUCHPOINT_COLS} FROM touchpoints ORDER BY date DESC, created_at DESC`
  );
}

const ALL_CLARIFICATION_COLS =
  '"id","source_input","source_context","hermes_guess","reason","status","resolution","resolution_payload","created_at","resolved_at"';

export async function fetchPendingClarifications(): Promise<import("@/lib/schema").ClarificationRow[]> {
  const db = await getDb();
  return db.select<import("@/lib/schema").ClarificationRow[]>(
    `SELECT ${ALL_CLARIFICATION_COLS} FROM clarifications WHERE status = 'pending' ORDER BY created_at DESC`
  );
}

export async function fetchClarificationsBy(
  status: "pending" | "resolved" | "abandoned" | "any" = "pending"
): Promise<import("@/lib/schema").ClarificationRow[]> {
  const db = await getDb();
  if (status === "any") {
    return db.select<import("@/lib/schema").ClarificationRow[]>(
      `SELECT ${ALL_CLARIFICATION_COLS} FROM clarifications ORDER BY created_at DESC`
    );
  }
  return db.select<import("@/lib/schema").ClarificationRow[]>(
    `SELECT ${ALL_CLARIFICATION_COLS} FROM clarifications WHERE status = $1 ORDER BY created_at DESC`,
    [status]
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

export function useAllTouchpoints() {
  return useQuery({ queryKey: queryKeys.touchpoints, queryFn: fetchAllTouchpoints });
}

export function usePendingClarifications() {
  return useQuery({
    queryKey: ["clarifications", "pending"] as const,
    queryFn: fetchPendingClarifications,
  });
}

const ALL_RELATIONSHIP_COLS =
  '"id","from_contact_id","to_contact_id","kind","label","notes","created_at"';

export async function fetchAllRelationships(): Promise<import("@/lib/schema").RelationshipRow[]> {
  const db = await getDb();
  return db.select<import("@/lib/schema").RelationshipRow[]>(
    `SELECT ${ALL_RELATIONSHIP_COLS} FROM relationships ORDER BY created_at DESC`
  );
}

/** All relationships involving a contact (either direction). */
export async function fetchRelationshipsForContact(
  contactId: string
): Promise<import("@/lib/schema").RelationshipRow[]> {
  const db = await getDb();
  return db.select<import("@/lib/schema").RelationshipRow[]>(
    `SELECT ${ALL_RELATIONSHIP_COLS} FROM relationships
       WHERE from_contact_id = $1 OR to_contact_id = $1
       ORDER BY created_at DESC`,
    [contactId]
  );
}

export function useAllRelationships() {
  return useQuery({
    queryKey: ["relationships"] as const,
    queryFn: fetchAllRelationships,
  });
}

export function useRelationshipsForContact(contactId: string | undefined) {
  return useQuery({
    queryKey: contactId
      ? (["relationships", "for-contact", contactId] as const)
      : (["relationships", "none"] as const),
    queryFn: () =>
      contactId ? fetchRelationshipsForContact(contactId) : Promise.resolve([]),
    enabled: Boolean(contactId),
  });
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

export async function fetchPolicyById(id: string): Promise<PolicyRow | null> {
  const db = await getDb();
  try {
    const rows = await db.select<Partial<PolicyRow>[]>(
      `SELECT * FROM policies WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows.length) return null;
    return normalizePolicyRow(rows[0]);
  } catch {
    return null;
  }
}

export function usePolicyById(id: string | undefined) {
  return useQuery({
    queryKey: id ? (["policies", "by-id", id] as const) : (["policies", "none"] as const),
    queryFn: () => (id ? fetchPolicyById(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

export function useInvestmentProducts(options: { includeArchived?: boolean } = {}) {
  return useQuery({
    queryKey: options.includeArchived
      ? [...queryKeys.investmentProducts, "all"]
      : queryKeys.investmentProducts,
    queryFn: () => fetchInvestmentProducts(options),
  });
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
  // Trashed policies (deleted_at set) are always hidden from the client card —
  // they live on the Trash page until restored or purged. Archived is a
  // separate concept (kept for historical record on the card unless explicitly
  // hidden via the filter), so the includeArchived flag only governs that.
  const live = normalized.filter((r) => !(r.deleted_at || "").trim());
  if (options?.includeArchived) return live;
  return live.filter((r) => (r.status || "active") !== "archived");
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

export async function fetchAllPolicies(): Promise<PolicyRow[]> {
  const db = await getDb();
  const rows = await db.select<Partial<PolicyRow>[]>(
    `SELECT * FROM policies ORDER BY created_at DESC`
  );
  // Same trash filter as fetchPoliciesByContact: the dashboard and global
  // lists never show policies that have been discarded; they live on the
  // Trash page until restored or purged.
  return rows
    .map(normalizePolicyRow)
    .filter((r) => !(r.deleted_at || "").trim());
}

/** Trashed policies for the Trash page's Policies section. Sorted by most-
 *  recently-discarded so the row Jovial just sent there is at the top. */
export async function fetchTrashedPolicies(): Promise<PolicyRow[]> {
  const db = await getDb();
  try {
    const rows = await db.select<Partial<PolicyRow>[]>(
      `SELECT * FROM policies
        WHERE deleted_at IS NOT NULL AND deleted_at != ''
        ORDER BY deleted_at DESC`
    );
    return rows.map(normalizePolicyRow);
  } catch {
    // Migration hasn't run yet — no deleted_at column, no trash exists.
    return [];
  }
}

export function useAllPolicies() {
  return useQuery({
    queryKey: queryKeys.policies,
    queryFn: fetchAllPolicies,
  });
}

export function useTrashedPolicies() {
  return useQuery({
    queryKey: queryKeys.trashedPolicies,
    queryFn: fetchTrashedPolicies,
  });
}

// ── Journal ───────────────────────────────────────────────────────────────────

const JOURNAL_COLS =
  '"date","appointments","fyc_opened","fyc_closed","new_candidate_conversation","win_challenge","created_at","updated_at"';

export async function fetchJournalEntry(date: string): Promise<JournalEntry | null> {
  const db = await getDb();
  const rows = await db.select<JournalEntry[]>(
    `SELECT ${JOURNAL_COLS} FROM journal_entries WHERE date = $1 LIMIT 1`,
    [date]
  );
  return rows[0] ?? null;
}

export async function fetchJournalHistory(limit = 90): Promise<JournalEntry[]> {
  const db = await getDb();
  return db.select<JournalEntry[]>(
    `SELECT ${JOURNAL_COLS} FROM journal_entries ORDER BY date DESC LIMIT $1`,
    [limit]
  );
}

export async function upsertJournalEntry(entry: Omit<JournalEntry, "created_at" | "updated_at">): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO journal_entries
       (date, appointments, fyc_opened, fyc_closed, new_candidate_conversation, win_challenge, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT(date) DO UPDATE SET
       appointments               = excluded.appointments,
       fyc_opened                 = excluded.fyc_opened,
       fyc_closed                 = excluded.fyc_closed,
       new_candidate_conversation = excluded.new_candidate_conversation,
       win_challenge              = excluded.win_challenge,
       updated_at                 = excluded.updated_at`,
    [entry.date, entry.appointments, entry.fyc_opened, entry.fyc_closed,
     entry.new_candidate_conversation, entry.win_challenge, now]
  );
}

export function useJournalEntry(date: string) {
  return useQuery({
    queryKey: ["journal", date] as const,
    queryFn: () => fetchJournalEntry(date),
  });
}

export function useJournalHistory(limit = 90) {
  return useQuery({
    queryKey: ["journal", "history", limit] as const,
    queryFn: () => fetchJournalHistory(limit),
  });
}

export function useTrashedContacts() {
  return useQuery({
    queryKey: queryKeys.trashedContacts,
    queryFn: fetchTrashedContacts,
  });
}

export function useDocumentsByContact(contactId: string | undefined) {
  return useQuery({
    queryKey: contactId
      ? queryKeys.documentsByContact(contactId)
      : ["documents", "none"],
    queryFn: () =>
      contactId ? fetchDocumentsByContact(contactId) : Promise.resolve([]),
    enabled: Boolean(contactId),
  });
}
