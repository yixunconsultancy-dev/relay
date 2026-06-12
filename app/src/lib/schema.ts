// TypeScript shape of each SQLite row, matching DATA_SCHEMA.md.
// Every column in the kit is stored as TEXT (see SQLiteStore.ensure in
// scripts/relationship_os.py), so we deserialize defensively here.

import type {
  ContactType,
  RelationshipStage,
  TouchpointType,
  Sentiment,
  ReminderType,
  ReminderPriority,
  ReminderStatus,
  EventKind,
} from "@/lib/enums";

export interface ContactRow {
  id: string;
  name: string;
  type: ContactType | "";
  relationship_stage: RelationshipStage | "";
  phone: string;
  email: string;
  occupation: string;
  company: string;
  address: string;
  birthday: string;
  family: string;
  policies: string;
  financial_concerns: string;
  interests: string;
  referral_source: string;
  next_review_date: string;
  last_touch_date: string;
  notes: string;
  archived_at: string;
  deleted_at: string;
  /** JSON-encoded Record<string, string> of consultant-defined key-value fields. */
  custom_fields: string;
  created_at: string;
  updated_at: string;
}

export interface ContactDocumentRow {
  id: string;
  contact_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

export interface TouchpointRow {
  id: string;
  contact_id: string;
  contact_name: string;
  date: string;
  type: TouchpointType | "";
  sentiment: Sentiment | "";
  summary: string;
  topics: string;
  action_items: string;
  meeting_number: string;
  raw_input: string;
  notes: string;
  created_at: string;
}

export interface ReminderRow {
  id: string;
  contact_id: string;
  contact_name: string;
  due_date: string;
  type: ReminderType | "";
  priority: ReminderPriority | "";
  context: string;
  status: ReminderStatus | "";
  snoozed_until: string;
  source_touchpoint_id: string;
  created_at: string;
  completed_at: string;
}

export interface DailyFocusRow {
  date: string;
  priority_1: string;
  priority_2: string;
  priority_3: string;
  follow_ups_due: string;
  reflection: string;
  bottlenecks: string;
  created_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

/**
 * Contact-to-contact relationship row. Feeds the graph view + the
 * contact-detail family panel. Kinds: spouse, parent, child, sibling,
 * family (catch-all), friend, business_partner.
 */
export interface RelationshipRow {
  id: string;
  from_contact_id: string;
  to_contact_id: string;
  kind: string;
  label: string;
  notes: string;
  created_at: string;
}

/** list-relationships enriches each row with the contact names + archived flags. */
export interface EnrichedRelationship extends RelationshipRow {
  from_contact_name: string;
  to_contact_name: string;
  from_archived: boolean;
  to_archived: boolean;
}

/**
 * Clarification queue row. Used during bulk imports when Hermes can't
 * extract confidently — the row is parked here for triage in the AWMOS
 * /clarifications route rather than asked one-by-one inline in chat.
 */
export interface ClarificationRow {
  id: string;
  source_input: string;
  source_context: string;       // "bulk_import" / "telegram" / "manual"
  hermes_guess: string;         // JSON-encoded best-guess extraction (may be "")
  reason: string;
  status: "pending" | "resolved" | "abandoned" | "";
  resolution: "log_anyway" | "log_corrected" | "discard" | "";
  resolution_payload: string;   // JSON-encoded corrected payload
  created_at: string;
  resolved_at: string;
}

export interface PolicyRow {
  id: string;
  contact_id: string;
  insurer: string;
  plan_name: string;
  policy_type: string;
  policy_number: string;
  sum_assured: string;
  premium_amount: string;
  premium_frequency: string;
  premium_term: string;
  policy_term: string;
  payment_method: string;
  start_date: string;
  review_date: string;
  review_frequency: string;
  last_reviewed: string;
  current_value: string;
  valuation_date: string;
  surrender_value: string;
  policy_owner: string;
  life_assured: string;
  payor: string;
  beneficiaries: string;
  riders: string;
  servicing_rep: string;
  needs_category: string;
  status: string;
  notes: string;
  // Investments dashboard columns
  portfolio: string;             // Free-text custom label (used when portfolio_tag = "custom")
  portfolio_tag: string;         // Enum: see PORTFOLIO_TAGS
  total_premiums_paid: string;
  lock_in_period: string;        // Free-text "60 months" / "5 years" / "60"
  lock_in_end_date: string;      // Explicit user-set unlock date (overrides computed)
  premium_holiday_months: string; // Integer count of skipped months
  product_id: string;
  has_nomination: string;        // "yes" / "no" / "" — gates the beneficiaries block
  // Trash / soft-delete. ISO timestamp when Jovial discarded the policy from
  // the client card. Rows with deleted_at set are filtered out of the normal
  // policy list and surfaced on the Trash page's Policies section instead;
  // restoring clears this back to "".
  deleted_at: string;
  created_at: string;
  updated_at: string;
}

// Need categories on a policy (multi-select). Each value can drive an auto-
// generated benefit row under Sum Assured. Keep these in sync with the
// PolicyForm UI's options list.
export const NEED_CATEGORIES = [
  "death",
  "tpd",
  "major_ci",
  "early_ci",
  "accident",
  "hospitalisation",
  "dental",
  "retirement",
  "savings_investments",
  "child_education",
  "legacy",
] as const;
export type NeedCategory = (typeof NEED_CATEGORIES)[number];

export const NEED_CATEGORY_LABEL: Record<NeedCategory, string> = {
  death: "Death",
  tpd: "TPD",
  major_ci: "Major CI",
  early_ci: "Early CI",
  accident: "Accident",
  hospitalisation: "Hospitalisation",
  dental: "Dental",
  retirement: "Retirement",
  savings_investments: "Savings/Investments",
  child_education: "Child Education",
  legacy: "Legacy",
};

/** Shape of one beneficiary row inside the beneficiaries JSON array. */
export interface Beneficiary {
  name: string;
  relationship: string;
  percentage: string; // free-text on the wire; UI validates as a number
}

// Portfolio tags (must match Python's PORTFOLIO_TAGS in scripts/relationship_os.py).
export const PORTFOLIO_TAGS = [
  "pro_adventurous",
  "pro_balanced",
  "pro_cautious",
  "elite_adventurous",
  "elite_balanced",
  "steady",
  "ferrari",
  "custom",
] as const;
export type PortfolioTag = (typeof PORTFOLIO_TAGS)[number];

/** Human-readable label for a portfolio tag (used in chips and badges). */
export const PORTFOLIO_TAG_LABEL: Record<PortfolioTag, string> = {
  pro_adventurous: "Pro Adventurous",
  pro_balanced: "Pro Balanced",
  pro_cautious: "Pro Cautious",
  elite_adventurous: "Elite Adventurous",
  elite_balanced: "Elite Balanced",
  steady: "Steady",
  ferrari: "Ferrari",
  custom: "Custom",
};

export const EDITABLE_POLICY_FIELDS = [
  "insurer",
  "plan_name",
  "policy_type",
  "policy_number",
  "sum_assured",
  "premium_amount",
  "premium_frequency",
  "premium_term",
  "policy_term",
  "payment_method",
  "start_date",
  "review_date",
  "review_frequency",
  "last_reviewed",
  "current_value",
  "valuation_date",
  "surrender_value",
  "policy_owner",
  "life_assured",
  "payor",
  "beneficiaries",
  "riders",
  "servicing_rep",
  "needs_category",
  "status",
  "notes",
  "portfolio",
  "portfolio_tag",
  "total_premiums_paid",
  "lock_in_period",
  "lock_in_end_date",
  "premium_holiday_months",
  "product_id",
  "has_nomination",
] as const satisfies readonly (keyof PolicyRow)[];

// ── Investment Products catalog ─────────────────────────────────────────────
// One row per product type (Pro Achiever, Platinum Wealth Venture, …). When
// Jovial creates a new client policy in the Investments dashboard she picks a
// product; the policy inherits premium_term and lock_in_period from it.
export interface InvestmentProduct {
  id: string;
  name: string;
  premium_term: string;
  lock_in_period: string;
  notes: string;
  archived_at: string;
  created_at: string;
  updated_at: string;
}

export type EditablePolicyField = (typeof EDITABLE_POLICY_FIELDS)[number];

export const POLICY_STATUSES = [
  "active",
  "lapsed",
  "surrendered",
  "claimed",
  "archived",
] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export interface JournalEntry {
  date: string;                       // YYYY-MM-DD primary key
  appointments: number;               // New appointments made
  fyc_opened: number;                 // FYC cases opened
  fyc_closed: number;                 // FYC cases closed
  new_candidate_conversation: number; // 0 = No, 1 = Yes
  win_challenge: string;              // Free-text reflection
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  // SQLite-assigned monotonic rowid. Public event `id` is a random-suffixed
  // text token and does not sort monotonically, so polling cursors must use
  // rowid (or seq), not id.
  rowid: number;
  id: string;
  timestamp: string;
  kind: EventKind | "";
  contact_id: string;
  subject_id: string;
  payload: string;
  source: string;
}

// Consultant-managed fields (editable in the app).
// Hermes owns: name, last_touch_date, created_at, updated_at.
// type and relationship_stage can be overridden by the consultant.
export const EDITABLE_CONTACT_FIELDS = [
  "type",
  "phone",
  "email",
  "occupation",
  "company",
  "address",
  "birthday",
  "family",
  "policies",
  "financial_concerns",
  "interests",
  "referral_source",
  "next_review_date",
  "notes",
] as const satisfies readonly (keyof ContactRow)[];

export type EditableContactField = (typeof EDITABLE_CONTACT_FIELDS)[number];

export const HERMES_MANAGED_FIELDS = [
  "name",
  "last_touch_date",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ContactRow)[];

export type HermesManagedField = (typeof HERMES_MANAGED_FIELDS)[number];
