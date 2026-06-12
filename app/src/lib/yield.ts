// Modified Dietz yield calculator for DCA investment policies.
//
// PROBLEM
// -------
// Each client adds money on inconsistent dates (bank-logged transactions),
// at different frequencies (monthly / quarterly / etc.), and may skip months.
// Jovial keeps a running `total_premiums_paid` and the latest `current_value`
// updated, but doesn't log individual transactions. We need a "good enough"
// annualised return that:
//   * accounts for dollar-cost averaging (later premiums have had less time
//     to compound, so they contribute less to the return calculation),
//   * tolerates premium holidays (Jovial enters the count of skipped months),
//   * tolerates catch-up payments (when total_premiums_paid differs from the
//     synthetic expected sum, the delta is bundled as a single flow at the
//     most recent expected payment date).
//
// FORMULA (Modified Dietz)
// ------------------------
//   return = (V_end − V_start − ΣF_i) / (V_start + Σ(w_i · F_i))
//
// For a fresh policy V_start = 0, so it simplifies to:
//   return = (currentValue − totalPaid) / Σ(w_i · F_i)
//
// where w_i = (T − t_i) / T is the fraction of the total period each flow
// has been invested. We then annualise the period return with a simple
// linear conversion (return ÷ T_years); for very short periods we return
// null rather than projecting a spurious annualised number.
//
// All money is treated as a plain number — currency formatting is the
// caller's problem.

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

export interface YieldInputs {
  startDate: string;            // ISO YYYY-MM-DD
  premiumAmount: number;        // SGD per payment, > 0
  premiumFrequency: string;     // "Monthly" | "Quarterly" | ... | "Single-Pay"
  totalPremiumsPaid: number;    // running total
  currentValue: number;         // current fund value
  asOf: string;                 // ISO YYYY-MM-DD (valuation date)
  premiumHolidayMonths: number; // count of months skipped
}

export interface YieldResult {
  annualisedPct: number | null; // e.g. 6.8 for 6.8% — null when not computable
  periodYears: number | null;
  totalGain: number | null;     // currentValue − totalPaid (signed)
  reason?: string;              // when annualisedPct is null, why
}

/** Convert a frequency label to months between payments. Returns 0 for
 * single-pay (no schedule — entire premium goes in at the start). Returns
 * null when we can't recognise the label. */
function freqToMonths(freq: string): number | null {
  const f = (freq || "").toLowerCase().trim().replace(/[-_\s]/g, "");
  if (f.startsWith("month")) return 1;
  if (f.startsWith("quarter")) return 3;
  if (f.startsWith("semi") || f.startsWith("biannual")) return 6;
  if (f.startsWith("annual") || f === "yearly") return 12;
  if (f.startsWith("single") || f === "lumpsum" || f === "onetime") return 0;
  return null;
}

/** Add `months` to an ISO date, clipping the day to the last day of the
 * target month so adding 1 month to Jan 31 yields Feb 28/29 (not Mar 3). */
function addMonths(iso: string, months: number): string | null {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return (db - da) / MS_PER_DAY;
}

function isValidIso(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime());
}

/** Build the synthetic schedule of (date, amount) flows. */
function buildSchedule(opts: {
  startDate: string;
  asOf: string;
  premiumAmount: number;
  monthsBetween: number;
  holidayMonths: number;
  totalPaid: number;
}): Array<{ date: string; amount: number }> {
  const { startDate, asOf, premiumAmount, monthsBetween, holidayMonths, totalPaid } = opts;
  const flows: Array<{ date: string; amount: number }> = [];

  if (monthsBetween === 0) {
    // Single-pay — one flow of totalPaid (preferred over premiumAmount in
    // case Jovial topped it up later) at the start date.
    flows.push({ date: startDate, amount: totalPaid > 0 ? totalPaid : premiumAmount });
    return flows;
  }

  // Walk from startDate forward in monthsBetween steps until we pass asOf.
  let current = startDate;
  let safety = 0;
  while (current && current <= asOf && safety < 2000) {
    flows.push({ date: current, amount: premiumAmount });
    const next = addMonths(current, monthsBetween);
    if (!next) break;
    current = next;
    safety++;
  }

  // Apply premium holidays — drop the most recent N scheduled payments
  // (clients usually take a break when cash is tight; assume those holidays
  // are most recent unless we have better info).
  const droppedFromHoliday = Math.min(holidayMonths, flows.length);
  for (let i = 0; i < droppedFromHoliday; i++) flows.pop();

  // Reconcile against totalPaid. If the synthetic sum is off by more than
  // half a premium, attribute the delta as a single flow at the most recent
  // expected payment date (a catch-up or shortfall). This lets a client who
  // paid 2 months in one shot still show roughly the right yield.
  const expected = flows.reduce((s, f) => s + f.amount, 0);
  const delta = totalPaid - expected;
  if (Math.abs(delta) > premiumAmount * 0.5 && Math.abs(delta) >= 1) {
    if (flows.length > 0) {
      flows[flows.length - 1].amount += delta;
    } else {
      // No flows survived (e.g. holiday_months > scheduled count); put the
      // whole delta at the start date.
      flows.push({ date: startDate, amount: delta });
    }
  }

  return flows;
}

export function computeAnnualisedYield(inputs: YieldInputs): YieldResult {
  const {
    startDate,
    premiumAmount,
    premiumFrequency,
    totalPremiumsPaid,
    currentValue,
    asOf,
    premiumHolidayMonths,
  } = inputs;

  // Input validation — return null with a reason rather than throw, so the
  // UI can show "—" with a tooltip explaining what's missing.
  if (!isValidIso(startDate))
    return { annualisedPct: null, periodYears: null, totalGain: null, reason: "start_date missing or invalid" };
  if (!isValidIso(asOf))
    return { annualisedPct: null, periodYears: null, totalGain: null, reason: "as-of date missing" };
  if (!(premiumAmount > 0))
    return { annualisedPct: null, periodYears: null, totalGain: null, reason: "premium_amount missing or zero" };
  if (!(totalPremiumsPaid > 0))
    return { annualisedPct: null, periodYears: null, totalGain: null, reason: "total_premiums_paid missing" };
  if (!(currentValue > 0))
    return { annualisedPct: null, periodYears: null, totalGain: null, reason: "current_value missing" };

  const months = freqToMonths(premiumFrequency);
  if (months === null)
    return { annualisedPct: null, periodYears: null, totalGain: null, reason: `unknown frequency: ${premiumFrequency}` };

  const periodDays = daysBetween(startDate, asOf);
  if (periodDays <= 0)
    return { annualisedPct: null, periodYears: null, totalGain: null, reason: "as-of date is before start date" };
  const T = periodDays / DAYS_PER_YEAR;
  if (T < 0.1)
    return {
      annualisedPct: null,
      periodYears: T,
      totalGain: currentValue - totalPremiumsPaid,
      reason: "period too short — need at least ~5 weeks of data",
    };

  const flows = buildSchedule({
    startDate,
    asOf,
    premiumAmount,
    monthsBetween: months,
    holidayMonths: Math.max(0, premiumHolidayMonths | 0),
    totalPaid: totalPremiumsPaid,
  });

  // avg_capital = Σ (amount × weight); weight = (T - t_i)/T where t_i is
  // years since start of the flow.
  let avgCapital = 0;
  for (const f of flows) {
    const t_i_years = daysBetween(startDate, f.date) / DAYS_PER_YEAR;
    const weight = (T - t_i_years) / T;
    avgCapital += f.amount * weight;
  }

  if (avgCapital <= 0) {
    return {
      annualisedPct: null,
      periodYears: T,
      totalGain: currentValue - totalPremiumsPaid,
      reason: "could not weight cash flows — check the schedule",
    };
  }

  const gain = currentValue - totalPremiumsPaid;
  const periodReturn = gain / avgCapital;
  const annualised = (periodReturn / T) * 100;

  return {
    annualisedPct: annualised,
    periodYears: T,
    totalGain: gain,
  };
}
