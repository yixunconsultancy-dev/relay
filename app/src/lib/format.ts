import { format, parseISO, isValid, formatDistanceToNowStrict } from "date-fns";

/** Format an ISO date string (YYYY-MM-DD) as a short human-readable date. */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (!trimmed) return "—";
  try {
    const parsed = parseISO(trimmed);
    if (!isValid(parsed)) return trimmed;
    return format(parsed, "d MMM yyyy");
  } catch {
    return trimmed;
  }
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Format an ISO timestamp as a relative phrase: "3 days ago", "in 2 weeks".
 *
 * Date-only values (YYYY-MM-DD with no time component) are rendered in
 * day-resolution language ("today", "tomorrow", "in 3 days", "yesterday",
 * "2 days ago") rather than hour-based phrasing, since "due today" was
 * showing as "15 hours ago" simply because parseISO defaults date-only
 * strings to midnight local time.
 */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (ISO_DATE_ONLY.test(trimmed)) {
    return formatRelativeDateOnly(trimmed);
  }

  try {
    const parsed = parseISO(trimmed);
    if (!isValid(parsed)) return "";
    return formatDistanceToNowStrict(parsed, { addSuffix: true });
  } catch {
    return "";
  }
}

function formatRelativeDateOnly(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0 && days <= 14) return `in ${days} days`;
  if (days < 0 && days >= -14) return `${Math.abs(days)} days ago`;
  // Fall back to date-fns for larger gaps so "in 3 weeks" / "5 months ago"
  // still read naturally.
  try {
    return formatDistanceToNowStrict(target, { addSuffix: true, unit: "day" });
  } catch {
    return "";
  }
}

/** Today's date in YYYY-MM-DD form. Uses an IANA timezone when provided. */
export function todayIso(timeZone?: string | null): string {
  const cleanZone = timeZone?.trim();
  if (cleanZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: cleanZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const get = (type: string) =>
        parts.find((part) => part.type === type)?.value;
      const year = get("year");
      const month = get("month");
      const day = get("day");
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
      // Fall back to browser-local time if the saved timezone is invalid.
    }
  }
  return format(new Date(), "yyyy-MM-dd");
}

/** Title-case a snake_case enum value for display ("follow_up" → "Follow up"). */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toString()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a raw amount string as SGD currency: "$4,800" / "$15,000" /
 * "$1,234,567". Accepts strings with commas, dollar signs, or whitespace
 * (which it strips before parsing). Returns "—" for blank/zero inputs.
 *
 * Cents are only shown if the parsed value actually has a fractional part —
 * a clean 4800 stays as "$4,800", not "$4,800.00".
 *
 * Hoisted from investments.tsx so the same formatter is used wherever a
 * money value appears (policy cards, investments dashboard, etc.).
 */
export function formatMoney(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[,$\s]/g, ""));
  if (!isFinite(n) || n === 0) {
    // Preserve a non-zero unparseable value (e.g. "TBC") so we don't hide
    // information; only fall through to "—" for genuinely blank/zero inputs.
    const str = String(raw).trim();
    return str && str !== "0" ? str : "—";
  }
  const hasCents = Math.abs(n - Math.trunc(n)) > 0.0001;
  return n.toLocaleString("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}
