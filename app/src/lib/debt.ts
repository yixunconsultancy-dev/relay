// Relationship debt — momentum decay flags computed from contacts +
// touchpoints + reminders, no kit changes needed.
//
// Concept borrowed from the Consultant OS analysis (vault note 2026-05-24).
// "Debt" is a broader concept than "needs attention": it covers explicit
// promised follow-ups that didn't happen, not just stale contacts.
//
// Categories:
//   - cooling           — warm/hot contact, no touchpoint in 30 days
//   - at_risk           — client, no touchpoint in 60 days
//   - unfollowed_action — touchpoint with action_items, no reminder linked,
//                          and it's been >= 7 days (you said you'd do
//                          something, then never created a reminder for it)
//   - stale_prospect    — prospect, no touchpoint in 14 days
//
// All pure functions, all data lives in the existing SQLite tables.

import { differenceInCalendarDays, parseISO, isValid } from "date-fns";

import type {
  ContactRow,
  ReminderRow,
  TouchpointRow,
} from "@/lib/schema";
import type { ContactType, RelationshipStage } from "@/lib/enums";

export type DebtCategory =
  | "cooling"
  | "at_risk"
  | "unfollowed_action"
  | "stale_prospect";

export interface DebtFlag {
  category: DebtCategory;
  contact: ContactRow;
  daysSince: number | null;
  // Only set for unfollowed_action — points at the originating touchpoint so
  // the UI can deep-link to it.
  touchpoint?: TouchpointRow;
}

export const COOLING_THRESHOLD_DAYS = 30;
export const AT_RISK_THRESHOLD_DAYS = 60;
export const STALE_PROSPECT_THRESHOLD_DAYS = 14;
export const UNFOLLOWED_ACTION_GRACE_DAYS = 7;

function daysSinceTouch(c: ContactRow, today: Date): number | null {
  if (!c.last_touch_date) return null;
  const d = parseISO(c.last_touch_date);
  if (!isValid(d)) return null;
  return differenceInCalendarDays(today, d);
}

function isContactActive(c: ContactRow): boolean {
  // Archived contacts shouldn't generate debt.
  return !c.archived_at;
}

/**
 * Compute debt flags across all four categories. A single contact may appear
 * in multiple categories (e.g. a cooling client with an unfollowed action).
 *
 * Output sorted by category-urgency (at_risk > unfollowed_action > cooling >
 * stale_prospect), then by oldest-first within each category.
 */
export function computeDebt(
  contacts: ContactRow[],
  touchpoints: TouchpointRow[],
  reminders: ReminderRow[],
  today: Date = new Date()
): DebtFlag[] {
  const out: DebtFlag[] = [];
  const contactsById = new Map<string, ContactRow>();
  for (const c of contacts) contactsById.set(c.id, c);

  // Stage 1: contact-shaped categories (cooling, at_risk, stale_prospect).
  for (const c of contacts) {
    if (!isContactActive(c)) continue;
    const stage = c.relationship_stage as RelationshipStage;
    const type = c.type as ContactType;
    const days = daysSinceTouch(c, today);
    const noTouch = days === null;

    // at_risk has priority over cooling for clients — emit the most-severe
    // flag per contact-stage rule, not both.
    if (type === "client" && (noTouch || (days ?? 0) >= AT_RISK_THRESHOLD_DAYS)) {
      out.push({ category: "at_risk", contact: c, daysSince: days });
      continue;
    }
    if ((stage === "warm" || stage === "hot") && (noTouch || (days ?? 0) >= COOLING_THRESHOLD_DAYS)) {
      out.push({ category: "cooling", contact: c, daysSince: days });
      continue;
    }
    if (type === "prospect" && (noTouch || (days ?? 0) >= STALE_PROSPECT_THRESHOLD_DAYS)) {
      out.push({ category: "stale_prospect", contact: c, daysSince: days });
    }
  }

  // Stage 2: unfollowed actions — touchpoint with action_items but no
  // reminder linked back, and old enough that grace has expired.
  const remindersByTouchpoint = new Set<string>();
  for (const r of reminders) {
    if (r.source_touchpoint_id) remindersByTouchpoint.add(r.source_touchpoint_id);
  }
  for (const tp of touchpoints) {
    if (!tp.action_items || !tp.action_items.trim()) continue;
    if (remindersByTouchpoint.has(tp.id)) continue;
    const tpDate = tp.date ? parseISO(tp.date) : null;
    if (!tpDate || !isValid(tpDate)) continue;
    const tpDays = differenceInCalendarDays(today, tpDate);
    if (tpDays < UNFOLLOWED_ACTION_GRACE_DAYS) continue;
    const contact = contactsById.get(tp.contact_id);
    if (!contact || !isContactActive(contact)) continue;
    out.push({
      category: "unfollowed_action",
      contact,
      daysSince: tpDays,
      touchpoint: tp,
    });
  }

  out.sort(byUrgency);
  return out;
}

const CATEGORY_PRIORITY: Record<DebtCategory, number> = {
  at_risk: 0,
  unfollowed_action: 1,
  cooling: 2,
  stale_prospect: 3,
};

function byUrgency(a: DebtFlag, b: DebtFlag): number {
  const pa = CATEGORY_PRIORITY[a.category];
  const pb = CATEGORY_PRIORITY[b.category];
  if (pa !== pb) return pa - pb;
  return (b.daysSince ?? 9999) - (a.daysSince ?? 9999);
}

export interface DebtBuckets {
  at_risk: DebtFlag[];
  unfollowed_action: DebtFlag[];
  cooling: DebtFlag[];
  stale_prospect: DebtFlag[];
}

/** Bucket the flat list by category for kanban-style rendering. */
export function bucketByCategory(flags: DebtFlag[]): DebtBuckets {
  const buckets: DebtBuckets = {
    at_risk: [],
    unfollowed_action: [],
    cooling: [],
    stale_prospect: [],
  };
  for (const f of flags) buckets[f.category].push(f);
  return buckets;
}

export const DEBT_CATEGORY_LABEL: Record<DebtCategory, string> = {
  at_risk: "At risk",
  unfollowed_action: "Unfollowed action",
  cooling: "Cooling",
  stale_prospect: "Stale prospect",
};

export const DEBT_CATEGORY_TONE: Record<
  DebtCategory,
  "danger" | "warning" | "neutral"
> = {
  at_risk: "danger",
  unfollowed_action: "warning",
  cooling: "warning",
  stale_prospect: "neutral",
};
