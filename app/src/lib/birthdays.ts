// Upcoming birthdays (and similar yearly anniversaries).
//
// contact.birthday is stored as YYYY-MM-DD in the kit's SQLite schema.
// Some legacy entries may use DD/MM/YYYY (user-typed via the app's date
// input). We accept both defensively.
//
// "Upcoming" means within the next N days inclusive, where N defaults to
// 7 for the Today screen "Coming up this week" section. Year is stripped
// when computing the next occurrence — birthdays repeat annually.

import type { ContactRow } from "@/lib/schema";

export const UPCOMING_BIRTHDAY_WINDOW_DAYS = 7;

export interface BirthdayEntry {
  contact: ContactRow;
  monthDay: string;          // "MM-DD"
  daysUntil: number;         // 0 = today, 1 = tomorrow, ...
  ageTurning: number | null; // null if birth year unknown / unparseable
}

/** Parse "YYYY-MM-DD" or "DD/MM/YYYY" into {year, month (1-12), day (1-31)}. */
function parseBirthday(raw: string): { year: number | null; month: number; day: number } | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    return {
      year: parseInt(iso[1], 10),
      month: parseInt(iso[2], 10),
      day: parseInt(iso[3], 10),
    };
  }
  // UK-style DD/MM/YYYY (or DD/MM/YY)
  const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (uk) {
    const day = parseInt(uk[1], 10);
    const month = parseInt(uk[2], 10);
    const yRaw = parseInt(uk[3], 10);
    const year = yRaw < 100 ? (yRaw < 30 ? 2000 + yRaw : 1900 + yRaw) : yRaw;
    return { year, month, day };
  }
  // Bare MM-DD or DD-MM (no year)
  const md = /^(\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (md) {
    const a = parseInt(md[1], 10);
    const b = parseInt(md[2], 10);
    // Heuristic: if first part > 12, treat as DD-MM. Otherwise YYYY-formatted
    // sources should already match the ISO branch above, so default to MM-DD.
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    return { year: null, month, day };
  }
  return null;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Return contacts whose birthday falls within `windowDays` of today,
 * sorted by soonest first.
 */
export function upcomingBirthdays(
  contacts: ContactRow[],
  today: Date = new Date(),
  windowDays: number = UPCOMING_BIRTHDAY_WINDOW_DAYS
): BirthdayEntry[] {
  const out: BirthdayEntry[] = [];
  const todayY = today.getFullYear();

  for (const c of contacts) {
    if (c.archived_at) continue;
    if (!c.birthday) continue;
    const parsed = parseBirthday(c.birthday);
    if (!parsed) continue;
    if (parsed.month < 1 || parsed.month > 12) continue;
    if (parsed.day < 1 || parsed.day > 31) continue;

    // Next occurrence: this year first; if already past, roll to next year.
    let nextOccurrence = new Date(todayY, parsed.month - 1, parsed.day);
    if (
      nextOccurrence.getMonth() !== parsed.month - 1 ||
      nextOccurrence.getDate() !== parsed.day
    ) {
      // Invalid calendar date (e.g., Feb 30). Skip.
      continue;
    }
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    if (nextOccurrence < todayMidnight) {
      nextOccurrence = new Date(todayY + 1, parsed.month - 1, parsed.day);
    }
    const daysUntil = Math.round(
      (nextOccurrence.getTime() - todayMidnight.getTime()) / 86400000
    );
    if (daysUntil > windowDays) continue;

    const ageTurning =
      parsed.year !== null && parsed.year > 1900
        ? nextOccurrence.getFullYear() - parsed.year
        : null;
    out.push({
      contact: c,
      monthDay: `${pad(parsed.month)}-${pad(parsed.day)}`,
      daysUntil,
      ageTurning,
    });
  }

  out.sort((a, b) => a.daysUntil - b.daysUntil);
  return out;
}
