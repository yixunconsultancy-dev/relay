// Policy detail page — opened by clicking a row in the Investments dashboard.
// Shows the requested fields (Policy Owner, Life Insured, Payor, Policy Name,
// Number, Annualised Premium, Start Date, Lock-In End, Premium Holiday,
// Months Till Unlock, Annualised Yield) and lets Jovial edit the ones that
// change over time.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge, PORTFOLIO_TAG_TONE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";

import {
  usePolicyById,
  useContact,
  useInvestmentProducts,
  useSettings,
  queryKeys,
} from "@/lib/queries";
import { updatePolicy } from "@/lib/kit";
import { resetDbConnection } from "@/lib/db";
import {
  PORTFOLIO_TAGS,
  PORTFOLIO_TAG_LABEL,
  type PortfolioTag,
} from "@/lib/schema";
import { computeAnnualisedYield } from "@/lib/yield";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Parse a free-text lock-in duration like "5 years", "60 months", "60" (assume months)
 * into a number of months. Returns null if unparseable. */
function parseLockInMonths(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(year|yr|y|month|mo|m)?s?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return null;
  const unit = m[2] || "month"; // bare number = months
  if (unit.startsWith("y")) return Math.round(n * 12);
  return Math.round(n);
}

/** Add months to an ISO date (clamps day to last-of-month). */
function addMonthsIso(iso: string, months: number): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

function monthsBetweenAbs(fromIso: string, toIso: string): number | null {
  if (!fromIso || !toIso) return null;
  const a = new Date(fromIso + "T00:00:00Z");
  const b = new Date(toIso + "T00:00:00Z");
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/** Convert period premium + frequency into an annualised SGD figure. */
function annualisedPremium(amount: string, freq: string): number | null {
  const n = Number(String(amount).replace(/[,$\s]/g, ""));
  if (!isFinite(n) || n <= 0) return null;
  const f = (freq || "").toLowerCase().trim();
  if (f.startsWith("month")) return n * 12;
  if (f.startsWith("quarter")) return n * 4;
  if (f.startsWith("semi") || f.startsWith("biannual")) return n * 2;
  if (f.startsWith("annual") || f === "yearly") return n;
  if (f.startsWith("single")) return n; // one-off; report as-is
  return null;
}

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const hasCents = Math.abs(n - Math.trunc(n)) > 0.0001;
  return n.toLocaleString("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${n >= 0 ? "" : ""}${n.toFixed(2)}%`;
}

// ─── route ──────────────────────────────────────────────────────────────────

export function PolicyDetailRoute() {
  const { policyId } = useParams<{ policyId: string }>();
  const queryClient = useQueryClient();

  const policy = usePolicyById(policyId);
  const products = useInvestmentProducts();
  const settings = useSettings();
  const contact = useContact(policy.data?.contact_id);

  // Editable form state. Initialised from the loaded policy; "dirty" when
  // anything has changed and not yet saved.
  //
  // product_id + premium_term are tracked here so the investment Plan Name
  // dropdown can write all three of (plan_name, product_id, premium_term,
  // lock_in_period) in one user gesture when a catalog product is picked.
  type Editable = {
    policy_owner: string;
    life_assured: string;
    payor: string;
    plan_name: string;
    product_id: string;
    premium_term: string;
    policy_number: string;
    portfolio_tag: string;
    portfolio: string;
    premium_amount: string;
    premium_frequency: string;
    start_date: string;
    lock_in_period: string;
    lock_in_end_date: string;
    premium_holiday_months: string;
    notes: string;
    current_value: string;
    total_premiums_paid: string;
    valuation_date: string;
  };
  const [form, setForm] = useState<Editable | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed form from the loaded policy. Re-run only when the policy id
  // changes so we don't blow away unsaved edits when the cache refreshes.
  useEffect(() => {
    if (!policy.data) return;
    setForm({
      policy_owner: policy.data.policy_owner || "",
      life_assured: policy.data.life_assured || "",
      payor: policy.data.payor || "",
      plan_name: policy.data.plan_name || "",
      product_id: policy.data.product_id || "",
      premium_term: policy.data.premium_term || "",
      policy_number: policy.data.policy_number || "",
      portfolio_tag: policy.data.portfolio_tag || "",
      portfolio: policy.data.portfolio || "",
      premium_amount: policy.data.premium_amount || "",
      premium_frequency: policy.data.premium_frequency || "Monthly",
      start_date: policy.data.start_date || "",
      lock_in_period: policy.data.lock_in_period || "",
      lock_in_end_date: policy.data.lock_in_end_date || "",
      premium_holiday_months: policy.data.premium_holiday_months || "",
      notes: policy.data.notes || "",
      current_value: policy.data.current_value || "",
      total_premiums_paid: policy.data.total_premiums_paid || "",
      valuation_date: policy.data.valuation_date || "",
    });
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy.data?.id]);

  const product = useMemo(() => {
    if (!form?.portfolio_tag) return null;
    return null; // we look up product separately below
  }, [form]);
  const productById = useMemo(() => {
    const m = new Map();
    for (const p of products.data ?? []) m.set(p.id, p);
    return m;
  }, [products.data]);
  void product;
  const policyProduct = policy.data ? productById.get(policy.data.product_id) : null;

  // ── Computed values ────────────────────────────────────────────────────
  const annualPremiumValue = form ? annualisedPremium(form.premium_amount, form.premium_frequency) : null;

  // Lock-in end date. Priority order:
  //   1. The user-set lock_in_end_date (explicit override; takes precedence)
  //   2. start_date + lock_in_period from this policy
  //   3. start_date + lock_in_period from the linked product (catalog default)
  const effectiveLockIn = form?.lock_in_period?.trim()
    || policyProduct?.lock_in_period?.trim()
    || "";
  const lockInMonths = parseLockInMonths(effectiveLockIn);
  const computedLockInEnd = (form?.start_date && lockInMonths)
    ? addMonthsIso(form.start_date, lockInMonths)
    : null;
  const userLockInEnd = form?.lock_in_end_date?.trim() || "";
  const effectiveLockInEnd = userLockInEnd || computedLockInEnd || null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const monthsTillUnlock = effectiveLockInEnd
    ? Math.max(0, monthsBetweenAbs(todayIso, effectiveLockInEnd) ?? 0)
    : null;

  const asOfDate = (form?.valuation_date || settings.data?.investments_correct_as_of || todayIso) as string;
  const yieldRes = form
    ? computeAnnualisedYield({
        startDate: form.start_date,
        premiumAmount: Number(String(form.premium_amount).replace(/[,$\s]/g, "")) || 0,
        premiumFrequency: form.premium_frequency,
        totalPremiumsPaid: Number(String(form.total_premiums_paid).replace(/[,$\s]/g, "")) || 0,
        currentValue: Number(String(form.current_value).replace(/[,$\s]/g, "")) || 0,
        asOf: asOfDate,
        premiumHolidayMonths: Number(form.premium_holiday_months) || 0,
      })
    : { annualisedPct: null, periodYears: null, totalGain: null, reason: "loading" };

  // ── Save ───────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      if (!policyId || !form) throw new Error("Policy not loaded.");
      return updatePolicy(policyId, form);
    },
    onSuccess: () => {
      setDirty(false);
      setSaveError(null);
      // Drop the SQL plugin's cached connection so the refetch sees what
      // Python just wrote (WAL snapshot otherwise sticks around).
      resetDbConnection();
      queryClient.invalidateQueries({ queryKey: ["policies", "by-id", policyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.policies });
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : String(e)),
  });

  function update<K extends keyof Editable>(k: K, v: Editable[K]) {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
    setDirty(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (policy.isLoading || !form) {
    return <div className="p-8 text-sm text-fg-muted">Loading policy…</div>;
  }
  if (policy.isError || !policy.data) {
    return (
      <div className="p-8">
        <Link to="/investments" className="text-sm text-fg-muted hover:text-fg inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Investments
        </Link>
        <p className="mt-6 text-sm text-status-error">Policy not found.</p>
      </div>
    );
  }

  const portfolioTag = (form.portfolio_tag || "") as PortfolioTag | "";
  const portfolioBadge = portfolioTag ? (
    <Badge tone={PORTFOLIO_TAG_TONE[portfolioTag as PortfolioTag]}>
      {portfolioTag === "custom" && form.portfolio.trim()
        ? `Custom · ${form.portfolio}`
        : PORTFOLIO_TAG_LABEL[portfolioTag as PortfolioTag]}
    </Badge>
  ) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6 sticky top-0 z-10">
        <Link to="/investments" className="text-xs text-fg-muted hover:text-fg inline-flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Investments
        </Link>
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="awm-label mb-1.5">{contact.data?.name || "Unknown client"}</p>
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              {form.plan_name || "Untitled policy"}
            </h1>
            <div className="mt-2 flex items-center gap-2">
              {form.policy_number && (
                <span className="text-xs text-fg-muted font-mono">{form.policy_number}</span>
              )}
              {portfolioBadge}
            </div>
          </div>
          <Button
            variant={dirty ? "gold" : "secondary"}
            size="sm"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            <Save className="h-4 w-4" />
            {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
        {saveError && (
          <p className="mt-2 text-xs text-status-error">{saveError}</p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {/* ── Computed snapshot ── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Annualised yield"
            value={formatPct(yieldRes.annualisedPct)}
            hint={yieldRes.reason ?? (yieldRes.periodYears ? `over ${yieldRes.periodYears.toFixed(1)}y` : "")}
            tone={
              yieldRes.annualisedPct === null
                ? "neutral"
                : yieldRes.annualisedPct >= 0
                ? "gold"
                : "danger"
            }
          />
          <StatCard
            label="Annualised premium"
            value={formatMoney(annualPremiumValue)}
            hint={form.premium_frequency || ""}
          />
          <StatCard
            label="Months till unlock"
            value={monthsTillUnlock !== null ? String(monthsTillUnlock) : "—"}
            hint={effectiveLockInEnd ? `unlock ${formatShortDate(effectiveLockInEnd)}` : "no lock-in set"}
          />
          <StatCard
            label="Total gain / (loss)"
            value={formatMoney(yieldRes.totalGain)}
            hint={form.current_value ? `as of ${formatShortDate(asOfDate)}` : ""}
            tone={
              yieldRes.totalGain === null
                ? "neutral"
                : yieldRes.totalGain >= 0
                ? "gold"
                : "danger"
            }
          />
        </section>

        {/* ── Policy fundamentals ── */}
        <section>
          <h2 className="awm-label mb-3">Policy fundamentals</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Policy owner" htmlFor="pd-owner">
              <Input id="pd-owner" value={form.policy_owner} onChange={(e) => update("policy_owner", e.target.value)} />
            </Field>
            <Field label="Life insured" htmlFor="pd-life">
              <Input id="pd-life" value={form.life_assured} onChange={(e) => update("life_assured", e.target.value)} />
            </Field>
            <Field label="Payor" htmlFor="pd-payor">
              <Input id="pd-payor" value={form.payor} onChange={(e) => update("payor", e.target.value)} />
            </Field>
            {/* Policy name. For investment policies, this is a strict
                dropdown of the active product catalog so picking a product
                also writes product_id, premium_term, and lock_in_period
                in one go. For other policy_types (health, life, etc.) we
                keep the free-text input — those plans aren't catalogued.

                Edge case: if the current plan_name doesn't match any active
                product (e.g. a legacy free-text value from before this
                change), we add a synthetic "Custom: <name>" option so the
                existing value isn't lost the moment the form mounts. */}
            <Field label="Policy name" htmlFor="pd-plan">
              {policy.data?.policy_type === "investment" ? (
                (() => {
                  const activeProducts = (products.data ?? []).filter(
                    (p) => !p.archived_at?.trim()
                  );
                  const matchedProduct = activeProducts.find(
                    (p) =>
                      p.name.trim().toLowerCase() ===
                      form.plan_name.trim().toLowerCase()
                  );
                  const hasUnmatchedCurrent =
                    form.plan_name.trim() && !matchedProduct;
                  return (
                    <select
                      id="pd-plan"
                      value={matchedProduct ? matchedProduct.id : "__custom__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") {
                          // Keep the existing free-text plan_name but unlink
                          // any product. Catalogue-derived fields stay put —
                          // the user can clear them by hand if needed.
                          update("product_id", "");
                          return;
                        }
                        const picked = activeProducts.find((p) => p.id === v);
                        if (!picked) return;
                        // Single user gesture writes all four catalogue-derived
                        // fields. The user can still edit any of these by hand
                        // afterwards if a specific policy has an exception.
                        setForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                plan_name: picked.name,
                                product_id: picked.id,
                                premium_term:
                                  picked.premium_term || prev.premium_term,
                                lock_in_period:
                                  picked.lock_in_period || prev.lock_in_period,
                              }
                            : prev
                        );
                        setDirty(true);
                      }}
                      className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
                    >
                      {hasUnmatchedCurrent && (
                        <option value="__custom__">
                          Custom: {form.plan_name} (keep as-is)
                        </option>
                      )}
                      {!hasUnmatchedCurrent && !matchedProduct && (
                        <option value="__custom__">— pick a product —</option>
                      )}
                      {activeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  );
                })()
              ) : (
                <Input
                  id="pd-plan"
                  value={form.plan_name}
                  onChange={(e) => update("plan_name", e.target.value)}
                />
              )}
            </Field>
            <Field label="Policy number" htmlFor="pd-num">
              <Input id="pd-num" value={form.policy_number} onChange={(e) => update("policy_number", e.target.value)} />
            </Field>
            <Field label="Start date" htmlFor="pd-start">
              <DateInput id="pd-start" value={form.start_date} onChange={(v) => update("start_date", v)} />
            </Field>
          </div>
        </section>

        {/* ── Premium & schedule ── */}
        <section>
          <h2 className="awm-label mb-3">Premium & schedule</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Premium amount" htmlFor="pd-amt">
              <Input id="pd-amt" value={form.premium_amount} onChange={(e) => update("premium_amount", e.target.value)} />
            </Field>
            <Field label="Frequency" htmlFor="pd-freq">
              <select
                id="pd-freq"
                value={form.premium_frequency}
                onChange={(e) => update("premium_frequency", e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
              >
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Semi-Annual">Semi-Annual</option>
                <option value="Annual">Annual</option>
                <option value="Single-Pay">Single-Pay</option>
              </select>
            </Field>
            <Field label="Lock-in period" htmlFor="pd-lock">
              <Input
                id="pd-lock"
                value={form.lock_in_period}
                onChange={(e) => update("lock_in_period", e.target.value)}
                placeholder={policyProduct?.lock_in_period || "e.g. 60 months"}
              />
            </Field>
            <Field label="Premium holiday months" htmlFor="pd-holiday">
              <Input
                id="pd-holiday"
                value={form.premium_holiday_months}
                onChange={(e) => update("premium_holiday_months", e.target.value.replace(/\D/g, ""))}
                placeholder="0"
              />
            </Field>
            <Field label="Lock-in end date" htmlFor="pd-lockend">
              <DateInput
                id="pd-lockend"
                value={form.lock_in_end_date}
                onChange={(v) => update("lock_in_end_date", v)}
                placeholder={
                  computedLockInEnd
                    ? `auto: ${formatShortDate(computedLockInEnd)}`
                    : "pick a date"
                }
              />
              {/* When the user hasn't set an explicit date, show the
                  computed value as a hint so they know what the system is
                  inferring. Clearing the field reverts to the computed
                  value on next render. */}
              {!form.lock_in_end_date && computedLockInEnd && (
                <p className="mt-1 text-[10px] text-fg-subtle">
                  Auto-computed from start date + lock-in. Leave blank to keep this default,
                  or pick a date to override.
                </p>
              )}
            </Field>
          </div>
        </section>

        {/* ── Portfolio & valuation ── */}
        <section>
          <h2 className="awm-label mb-3">Portfolio & valuation</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Portfolio tag" htmlFor="pd-tag">
              <select
                id="pd-tag"
                value={form.portfolio_tag}
                onChange={(e) => update("portfolio_tag", e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-bg-surface px-3 text-sm text-fg focus:border-gold/60 focus:outline-none"
              >
                <option value="">— Untagged —</option>
                {PORTFOLIO_TAGS.map((t) => (
                  <option key={t} value={t}>{PORTFOLIO_TAG_LABEL[t]}</option>
                ))}
              </select>
            </Field>
            <Field
              label={form.portfolio_tag === "custom" ? "Custom portfolio name" : "Portfolio label (optional)"}
              htmlFor="pd-portfolio"
            >
              <Input
                id="pd-portfolio"
                value={form.portfolio}
                onChange={(e) => update("portfolio", e.target.value)}
                placeholder={form.portfolio_tag === "custom" ? "e.g. Tech Heavy 70/30" : "leave blank to use the tag label"}
              />
            </Field>
            <Field label="Total premiums paid" htmlFor="pd-paid">
              <Input id="pd-paid" value={form.total_premiums_paid} onChange={(e) => update("total_premiums_paid", e.target.value)} />
            </Field>
            <Field label="Current fund value" htmlFor="pd-cv">
              <Input id="pd-cv" value={form.current_value} onChange={(e) => update("current_value", e.target.value)} />
            </Field>
            <Field label="Valuation date" htmlFor="pd-vd">
              <DateInput id="pd-vd" value={form.valuation_date} onChange={(v) => update("valuation_date", v)} placeholder="defaults to Correct As Of" />
            </Field>
          </div>
        </section>

        {/* ── Notes ── */}
        <section>
          <h2 className="awm-label mb-3">Notes</h2>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Anything Jovial or Yixun should remember about this policy — including the breakdown of a custom portfolio."
            rows={5}
            className="w-full rounded-sm border border-border bg-bg-surface px-3 py-2 text-sm text-fg focus:border-gold/60 focus:outline-none resize-y"
          />
        </section>

        {/* ── Yield calc explainer ── */}
        <section className="text-xs text-fg-subtle bg-bg-surface/40 border border-border rounded-sm p-3 leading-relaxed">
          <p className="font-condensed uppercase tracking-wider text-fg-muted mb-1.5">
            How the annualised yield is computed
          </p>
          <p>
            Modified Dietz weighting: each scheduled premium is weighted by
            the fraction of the period it has been invested. With
            {" "}<code>start_date</code>, <code>premium_amount</code>,
            {" "}<code>premium_frequency</code>, and{" "}
            <code>premium_holiday_months</code>, a synthetic schedule of
            payments is built. If <code>total_premiums_paid</code> doesn't
            match the schedule sum (catch-ups or unrecorded gaps), the
            difference is attributed as a single flow at the most recent
            scheduled date. Then{" "}
            <code>(current_value − total_paid) ÷ avg_capital_invested ÷ years</code>.
            Treat as an approximation, not a regulated return number.
          </p>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "gold" | "danger";
}) {
  const valueClass =
    tone === "gold" ? "text-gold" : tone === "danger" ? "text-status-error" : "text-fg";
  return (
    <div className="rounded-sm border border-border bg-bg-surface/40 p-3">
      <p className="awm-label">{label}</p>
      <p className={cn("mt-1 font-condensed text-2xl font-bold tabular-nums", valueClass)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
