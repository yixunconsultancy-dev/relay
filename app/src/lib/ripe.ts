// Ripe signals — contacts the system thinks are "warm and ready to move,"
// based on accumulated touchpoint patterns. Computed from contacts +
// touchpoints, no kit changes, no new tables.
//
// Heuristic (deliberately tight to avoid flood):
//   1. Contact is active (not archived)
//   2. Contact is NOT yet type='client' (clients are already converted —
//      they show up in debt/reminders, not ripe)
//   3. ≥ 2 positive-sentiment touchpoints in the last RIPE_WINDOW_DAYS days
//   4. Most recent touchpoint is within RIPE_RECENCY_DAYS days
//      (still active, not cooling off)
//
// Composite score = positiveCount × 2 + recencyBonus, where recencyBonus
// is 5 if last touchpoint was in the last 7 days else 0. Top-scoring
// contacts first.
//
// Note: ripe signals can overlap with debt categories. A warm prospect
// with 3 positive touchpoints in the last 30 days but no touchpoint for
// the last 25 days is BOTH ripe (engagement signal) AND cooling
// (momentum decay). That's the most actionable combination — they were
// interested and you're losing them.

import { differenceInCalendarDays, parseISO, isValid } from "date-fns";

import type { ContactRow, TouchpointRow } from "@/lib/schema";

export const RIPE_WINDOW_DAYS = 30;
export const RIPE_RECENCY_DAYS = 21;
export const RIPE_MIN_POSITIVE = 2;
const RECENCY_BONUS_WINDOW = 7;
const RECENCY_BONUS_POINTS = 5;

export interface RipeSignal {
  contact: ContactRow;
  positiveCount: number;       // positive touchpoints in the window
  daysSinceLast: number;       // since the most recent touchpoint (any sentiment)
  score: number;               // sort key
}

function isContactActive(c: ContactRow): boolean {
  return !c.archived_at;
}

export function computeRipeSignals(
  contacts: ContactRow[],
  touchpoints: TouchpointRow[],
  today: Date = new Date()
): RipeSignal[] {
  // Index touchpoints by contact for O(N) scan.
  const tpByContact = new Map<string, TouchpointRow[]>();
  for (const t of touchpoints) {
    const arr = tpByContact.get(t.contact_id) ?? [];
    arr.push(t);
    tpByContact.set(t.contact_id, arr);
  }

  const out: RipeSignal[] = [];
  for (const c of contacts) {
    if (!isContactActive(c)) continue;
    if (c.type === "client") continue;

    const tps = tpByContact.get(c.id) ?? [];
    if (tps.length === 0) continue;

    let positiveCount = 0;
    let mostRecent: number | null = null; // days since most recent (any sentiment)

    for (const t of tps) {
      if (!t.date) continue;
      const d = parseISO(t.date);
      if (!isValid(d)) continue;
      const days = differenceInCalendarDays(today, d);
      if (days < 0) continue; // future-dated, skip
      if (mostRecent === null || days < mostRecent) mostRecent = days;
      if (t.sentiment === "positive" && days <= RIPE_WINDOW_DAYS) {
        positiveCount += 1;
      }
    }

    if (positiveCount < RIPE_MIN_POSITIVE) continue;
    if (mostRecent === null || mostRecent > RIPE_RECENCY_DAYS) continue;

    const recencyBonus = mostRecent <= RECENCY_BONUS_WINDOW ? RECENCY_BONUS_POINTS : 0;
    const score = positiveCount * 2 + recencyBonus;
    out.push({
      contact: c,
      positiveCount,
      daysSinceLast: mostRecent,
      score,
    });
  }

  out.sort((a, b) => b.score - a.score || a.daysSinceLast - b.daysSinceLast);
  return out;
}
