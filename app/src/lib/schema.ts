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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

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
] as const satisfies readonly (keyof PolicyRow)[];

export type EditablePolicyField = (typeof EDITABLE_POLICY_FIELDS)[number];

export const POLICY_STATUSES = [
  "active",
  "lapsed",
  "surrendered",
  "claimed",
  "archived",
] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

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
// Hermes owns: name, type, relationship_stage, last_touch_date,
// created_at, updated_at. Those are read-only here.
export const EDITABLE_CONTACT_FIELDS = [
  "phone",
  "email",
  "occupation",
  "company",
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
  "type",
  "relationship_stage",
  "last_touch_date",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ContactRow)[];

export type HermesManagedField = (typeof HERMES_MANAGED_FIELDS)[number];
