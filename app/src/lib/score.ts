// Daily activity score + 7-day heatmap, computed from the events table.
//
// Pure functions over EventRow[] so they're trivial to test. The home screen
// passes in events from `fetchActivityEvents()` filtered to the last N days
// and the functions slice + sum by date.

import type { EventRow } from "@/lib/schema";

/** Weights per event kind. Tuned so a normal-good day lands around 30-50. */
export const EVENT_WEIGHTS: Record<string, number> = {
  // Real consultant work — most points
  touchpoint_logged: 10,
  contact_created: 15,
  policy_created: 8,
  contact_merged: 6,
  // Follow-through — moderate points
  reminder_completed: 5,
  contact_renamed: 3,
  contact_updated: 2,
  policy_updated: 2,
  // Maintenance — minimal credit, but not zero (still activity)
  contact_archived: 1,
  contact_unarchived: 1,
  policy_archived: 1,
  // Negative-signal / non-progress — explicitly zero so they don't game the score
  reminder_snoozed: 0,
  reminder_cancelled: 0,
  reminder_duplicate_skipped: 0,
};

const DEFAULT_WEIGHT = 1;

function weightFor(kind: string): number {
  return EVENT_WEIGHTS[kind] ?? DEFAULT_WEIGHT;
}

/** YYYY-MM-DD slice of an ISO timestamp. */
export function eventDate(timestamp: string): string {
  // Timestamps are stored as `YYYY-MM-DDTHH:MM:SS` (no timezone — matches
  // the consultant's local timezone per the kit's now_iso(). Just slice off
  // the date portion.
  return timestamp.slice(0, 10);
}

/** Sum the event weights for a given date (YYYY-MM-DD). */
export function computeDailyScore(events: EventRow[], date: string): number {
  let total = 0;
  for (const e of events) {
    if (eventDate(e.timestamp) !== date) continue;
    total += weightFor(e.kind);
  }
  return total;
}

export interface HeatmapCell {
  date: string;        // YYYY-MM-DD
  score: number;       // sum of event weights that day
  isToday: boolean;
}

/** Return 7 cells, oldest first, ending on `today`. */
export function compute7DayHeatmap(
  events: EventRow[],
  today: string
): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  const todayDate = new Date(today + "T00:00:00");
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    cells.push({
      date: iso,
      score: computeDailyScore(events, iso),
      isToday: i === 0,
    });
  }
  return cells;
}

/** Local-date YYYY-MM-DD (no timezone shift). */
function isoDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Highest score among the cells (for heatmap normalization). Returns 1 if all zero. */
export function heatmapMax(cells: HeatmapCell[]): number {
  let max = 0;
  for (const c of cells) if (c.score > max) max = c.score;
  return max || 1;
}

/** 7-day average (rounded), useful as "your typical day" context. */
export function heatmapAverage(cells: HeatmapCell[]): number {
  if (cells.length === 0) return 0;
  let sum = 0;
  for (const c of cells) sum += c.score;
  return Math.round(sum / cells.length);
}
