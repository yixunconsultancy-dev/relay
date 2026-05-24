// Daily activity score + 7-day heatmap.
//
// Score reflects ACTIVITY DATES, not data-entry dates:
//   Score for date D = (touchpoints whose `date` field = D, excluding
//   type='import') × 10
//
// "import" type touchpoints are bulk historical reconstruction, not real
// consultant activity, so they don't count — same exclusion the Today
// screen uses in fetchTouchpointsForDate.
//
// Why touchpoints (and not events): events.timestamp records WHEN the row
// was logged into the system. Touchpoint.date records WHEN the meeting/call
// actually happened. The latter is what the consultant cares about — bulk
// logging a week's worth of meetings on Friday shouldn't spike Friday and
// leave Mon-Thu empty.

import type { TouchpointRow } from "@/lib/schema";

export const TOUCHPOINT_WEIGHT = 10;
const IMPORT_TYPE = "import";

/** Count of touchpoints on `date` that count toward the score. */
function countableTouchpointsOn(
  touchpoints: TouchpointRow[],
  date: string
): number {
  let n = 0;
  for (const t of touchpoints) {
    if (t.date !== date) continue;
    if (t.type === IMPORT_TYPE) continue;
    n += 1;
  }
  return n;
}

/** Sum the activity score for a given YYYY-MM-DD date. */
export function computeDailyScore(
  touchpoints: TouchpointRow[],
  date: string
): number {
  return countableTouchpointsOn(touchpoints, date) * TOUCHPOINT_WEIGHT;
}

export interface HeatmapCell {
  date: string;        // YYYY-MM-DD
  score: number;       // count of real touchpoints × TOUCHPOINT_WEIGHT
  count: number;       // raw touchpoint count for the tooltip
  isToday: boolean;
}

/** Return N cells, oldest first, ending on `today`. Default 7 for
 *  backward compatibility with the original score card; the garden
 *  card calls it with 14. */
export function compute7DayHeatmap(
  touchpoints: TouchpointRow[],
  today: string,
  days: number = 7
): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  const todayDate = new Date(today + "T00:00:00");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    const count = countableTouchpointsOn(touchpoints, iso);
    cells.push({
      date: iso,
      count,
      score: count * TOUCHPOINT_WEIGHT,
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
