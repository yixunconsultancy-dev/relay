import { differenceInCalendarDays, parseISO, isValid } from "date-fns";

import type { ContactRow } from "@/lib/schema";
import type { ContactType, RelationshipStage } from "@/lib/enums";

export interface AttentionFlag {
  contact: ContactRow;
  reason: "cooling" | "at_risk";
  daysSinceTouch: number | null;
}

const COOLING_THRESHOLD_DAYS = 30;
const AT_RISK_THRESHOLD_DAYS = 60;

/**
 * Compute "needs attention" flags per the Today screen spec:
 *   - cooling: warm/hot contacts with no touchpoint in 30 days
 *   - at_risk: client contacts with no touchpoint in 60 days
 *
 * Returns sorted by urgency (longer-stale first).
 */
export function computeNeedsAttention(
  contacts: ContactRow[],
  today: Date = new Date()
): AttentionFlag[] {
  const out: AttentionFlag[] = [];
  for (const c of contacts) {
    const stage = c.relationship_stage as RelationshipStage;
    const type = c.type as ContactType;
    const last = c.last_touch_date ? parseISO(c.last_touch_date) : null;
    const daysSince =
      last && isValid(last) ? differenceInCalendarDays(today, last) : null;
    const noTouch = daysSince === null;

    // Cooling: warm/hot, no touchpoint in COOLING_THRESHOLD_DAYS
    if ((stage === "warm" || stage === "hot") && (noTouch || (daysSince ?? 0) >= COOLING_THRESHOLD_DAYS)) {
      out.push({ contact: c, reason: "cooling", daysSinceTouch: daysSince });
      continue;
    }
    // At risk: client type, no touchpoint in AT_RISK_THRESHOLD_DAYS
    if (type === "client" && (noTouch || (daysSince ?? 0) >= AT_RISK_THRESHOLD_DAYS)) {
      out.push({ contact: c, reason: "at_risk", daysSinceTouch: daysSince });
    }
  }
  out.sort((a, b) => (b.daysSinceTouch ?? 9999) - (a.daysSinceTouch ?? 9999));
  return out;
}
