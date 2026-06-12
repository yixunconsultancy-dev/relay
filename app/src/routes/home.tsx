import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Cake,
  ChevronRight,
  Plus,
  Sparkles,
  Sun,
  Users,
  TrendingUp,
  BadgeDollarSign,
  Shield,
  HandCoins,
} from "lucide-react";

import {
  Badge,
  PRIORITY_TONE,
  SENTIMENT_TONE,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GardenCard } from "@/components/garden-card";
import { QuickLogDialog } from "@/components/quick-log-dialog";
import {
  useAllReminders,
  useAllTouchpoints,
  useAllPolicies,
  useContacts,
  useSettings,
} from "@/lib/queries";
import { completeReminder } from "@/lib/kit";
import {
  computeDebt,
  DEBT_CATEGORY_LABEL,
  DEBT_CATEGORY_TONE,
} from "@/lib/debt";
import { computeRipeSignals } from "@/lib/ripe";
import { upcomingBirthdays } from "@/lib/birthdays";
import { getDb } from "@/lib/db";
import { getQuoteOfTheDay } from "@/lib/quotes";
import type { TouchpointRow } from "@/lib/schema";
import {
  formatShortDate,
  formatRelative,
  humanize,
  todayIso,
} from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import {
  TOUCHPOINT_TYPE_LABEL,
  type ReminderPriority,
  type Sentiment,
  type TouchpointType,
} from "@/lib/enums";

async function fetchRecentTouchpoints(since: string): Promise<TouchpointRow[]> {
  const db = await getDb();
  return db.select<TouchpointRow[]>(
    `SELECT "id","contact_id","contact_name","date","type","sentiment","summary","topics","action_items","meeting_number","raw_input","notes","created_at"
       FROM touchpoints
      WHERE date >= $1 AND type <> 'import'
      ORDER BY date DESC, created_at DESC`,
    [since]
  );
}

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function annualise(amount: string, frequency: string): number {
  const n = parseFloat(amount) || 0;
  const f = (frequency || "").toLowerCase();
  if (f.includes("month")) return n * 12;
  if (f.includes("quarter")) return n * 4;
  if (f.includes("half") || f.includes("semi")) return n * 2;
  return n; // annual / yearly / blank → as-is
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n.toLocaleString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HomeRoute() {
  const reminders = useAllReminders();
  const contacts = useContacts();
  const touchpoints = useAllTouchpoints();
  const policies = useAllPolicies();
  const settings = useSettings();
  const today = todayIso(settings.data?.timezone);
  const threeDaysAgo = subtractDays(today, 2); // today + 2 prior days = 3 days
  const recentTouchpoints = useQuery({
    queryKey: ["touchpoints", "recent", threeDaysAgo],
    queryFn: () => fetchRecentTouchpoints(threeDaysAgo),
  });
  const quote = getQuoteOfTheDay(today);
  const queryClient = useQueryClient();

  const [quickOpen, setQuickOpen] = useState(false);

  const todayHuman = formatShortDate(today);
  const consultantName = settings.data?.name?.trim() || "Consultant";
  const greeting = greetingFor(new Date().getHours());

  const dueNow = useMemo(() => {
    if (!reminders.data) return [];
    return reminders.data
      .filter((r) => r.status === "pending" && r.due_date && r.due_date <= today)
      .sort((a, b) => {
        const pr: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const pa = pr[a.priority] ?? 99;
        const pb = pr[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        return (a.due_date || "").localeCompare(b.due_date || "");
      });
  }, [reminders.data, today]);

  const debt = useMemo(() => {
    if (!contacts.data || !touchpoints.data || !reminders.data) return [];
    return computeDebt(
      contacts.data,
      touchpoints.data,
      reminders.data,
      new Date()
    );
  }, [contacts.data, touchpoints.data, reminders.data]);
  const debtPreview = debt.slice(0, 5);

  const ripe = useMemo(() => {
    if (!contacts.data || !touchpoints.data) return [];
    return computeRipeSignals(contacts.data, touchpoints.data, new Date());
  }, [contacts.data, touchpoints.data]);
  const ripePreview = ripe.slice(0, 5);

  const birthdays = useMemo(() => {
    if (!contacts.data) return [];
    return upcomingBirthdays(contacts.data, new Date());
  }, [contacts.data]);

  const kpis = useMemo(() => {
    const allContacts = contacts.data ?? [];
    const allPolicies = policies.data ?? [];
    const active = allPolicies.filter((p) => (p.status || "active") === "active");

    const totalAum = active.reduce((sum, p) => {
      const val = parseFloat(p.current_value || p.sum_assured || "0") || 0;
      return sum + val;
    }, 0);

    const totalPremium = active.reduce((sum, p) => {
      return sum + annualise(p.premium_amount, p.premium_frequency);
    }, 0);

    const claimed = allPolicies.filter((p) => p.status === "claimed");
    const totalSumAssured = active.reduce((sum, p) => {
      return sum + (parseFloat(p.sum_assured || "0") || 0);
    }, 0);
    const totalClaimsPaid = claimed.reduce((sum, p) => {
      return sum + (parseFloat(p.current_value || p.sum_assured || "0") || 0);
    }, 0);

    const clientCount = allContacts.filter((c) => c.type === "client").length;
    const prospectCount = allContacts.filter((c) => c.type === "prospect").length;

    return { totalAum, totalPremium, totalSumAssured, totalClaimsPaid, clientCount, prospectCount };
  }, [contacts.data, policies.data]);

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="awm-label flex items-center gap-1.5">
              <Sun className="h-3 w-3" />
              {todayHuman}
            </p>
            <h1 className="mt-1 font-display text-3xl font-light text-fg leading-none">
              {greeting}, {consultantName}.
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              {dueNow.length} reminder{dueNow.length === 1 ? "" : "s"} due ·{" "}
              {debt.length} debt item{debt.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button
            variant="gold"
            size="md"
            onClick={() => setQuickOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Quick log
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-6">

        {/* ── KPI Row 1: Financial totals ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Total AUM */}
          <div className="rounded-sm border border-border bg-bg-surface p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="awm-label">Total AUM</span>
              <TrendingUp className="h-4 w-4 text-gold opacity-60" />
            </div>
            <span className="text-4xl font-display font-light text-fg leading-none">
              {kpis.totalAum > 0 ? fmtMoney(kpis.totalAum) : "—"}
            </span>
            <span className="text-xs text-fg-muted">Assets under management · active policies</span>
          </div>

          {/* Ann. Premium */}
          <div className="rounded-sm border border-border bg-bg-surface p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="awm-label">Ann. Premium</span>
              <BadgeDollarSign className="h-4 w-4 text-gold opacity-60" />
            </div>
            <span className="text-4xl font-display font-light text-fg leading-none">
              {kpis.totalPremium > 0 ? fmtMoney(kpis.totalPremium) : "—"}
            </span>
            <span className="text-xs text-fg-muted">In-force annual premium</span>
          </div>
        </div>

        {/* ── KPI Row 2: Client & coverage stats ── */}
        <div className="grid grid-cols-3 gap-4">
          {/* Total Clients */}
          <div className="rounded-sm border border-border bg-bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="awm-label">Total Clients</span>
              <Users className="h-4 w-4 text-gold opacity-60" />
            </div>
            <span className="text-3xl font-display font-light text-fg leading-none">
              {kpis.clientCount}
            </span>
            <span className="text-xs text-fg-muted">
              {kpis.prospectCount} prospect{kpis.prospectCount !== 1 ? "s" : ""} in pipeline
            </span>
          </div>

          {/* Total Sum Assured */}
          <div className="rounded-sm border border-border bg-bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="awm-label">Total Sum Assured</span>
              <Shield className="h-4 w-4 text-gold opacity-60" />
            </div>
            <span className="text-3xl font-display font-light text-fg leading-none">
              {kpis.totalSumAssured > 0 ? fmtMoney(kpis.totalSumAssured) : "—"}
            </span>
            <span className="text-xs text-fg-muted">Total coverage across active policies</span>
          </div>

          {/* Total Claims Paid */}
          <div className="rounded-sm border border-border bg-bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="awm-label">Total Claims Paid</span>
              <HandCoins className="h-4 w-4 text-gold opacity-60" />
            </div>
            <span className="text-3xl font-display font-light text-fg leading-none">
              {kpis.totalClaimsPaid > 0 ? fmtMoney(kpis.totalClaimsPaid) : "—"}
            </span>
            <span className="text-xs text-fg-muted">Sum across claimed policies</span>
          </div>
        </div>

        {/* ── Quote of the Day ── */}
        <div className="rounded-sm border border-border bg-bg-surface px-6 py-5">
          <p className="awm-label mb-3">Quote of the Day</p>
          <p className="font-serif text-lg font-light text-fg leading-relaxed italic">
            "{quote.text}"
          </p>
          <p className="mt-2 text-xs text-fg-muted">— {quote.author}</p>
        </div>

        <GardenCard today={today} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section>
          <h2 className="awm-label mb-3">Reminders due now</h2>
          {reminders.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : dueNow.length === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-4 text-sm text-fg-muted italic">
              Nothing due. Inbox zero.
            </p>
          ) : (
            <ul className="space-y-2">
              {dueNow.map((r) => (
                <li
                  key={r.id}
                  className="rounded-sm border border-border bg-bg-surface p-3 flex items-start gap-3"
                >
                  <div className="flex flex-col items-center min-w-12">
                    <span className="text-xs text-fg/85 tabular-nums">
                      {formatShortDate(r.due_date)}
                    </span>
                    <span className="text-[10px] text-fg-subtle uppercase tracking-wider mt-0.5">
                      {formatRelative(r.due_date)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        to={`/contacts/${r.contact_id}`}
                        className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                      >
                        {r.contact_name}
                      </Link>
                      {r.priority && (
                        <Badge
                          tone={PRIORITY_TONE[r.priority as ReminderPriority]}
                        >
                          {humanize(r.priority)}
                        </Badge>
                      )}
                      <span className="text-[10px] uppercase tracking-wider font-condensed text-fg-muted">
                        {humanize(r.type)}
                      </span>
                    </div>
                    {r.context && (
                      <p className="mt-1.5 text-xs text-fg/85 leading-snug">
                        {r.context}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => completeMutation.mutate(r.id)}
                    disabled={completeMutation.isPending}
                  >
                    Done
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="awm-label inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              At Risk
            </h2>
            {debt.length > debtPreview.length && (
              <Link
                to="/debt"
                className="text-[10px] uppercase tracking-wider font-condensed text-gold hover:text-gold-bright transition-colors"
              >
                View all {debt.length} →
              </Link>
            )}
          </div>
          {contacts.isPending || touchpoints.isPending || reminders.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : debt.length === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-4 text-sm text-fg-muted italic">
              Inbox zero. No cooling contacts, no unfollowed actions.
            </p>
          ) : (
            <ul className="space-y-2">
              {debtPreview.map((f) => (
                <li
                  key={f.touchpoint?.id ?? f.contact.id}
                  className="rounded-sm border border-border bg-bg-surface p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/contacts/${f.contact.id}`}
                      className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                    >
                      {f.contact.name}
                    </Link>
                    <p className="text-xs text-fg-muted mt-0.5">
                      {DEBT_CATEGORY_LABEL[f.category]} ·{" "}
                      {f.daysSince === null
                        ? "no touchpoint logged"
                        : `${f.daysSince} day${f.daysSince === 1 ? "" : "s"} ago`}
                    </p>
                  </div>
                  <Badge tone={DEBT_CATEGORY_TONE[f.category]}>
                    {DEBT_CATEGORY_LABEL[f.category]}
                  </Badge>
                  <Link
                    to={`/contacts/${f.contact.id}`}
                    aria-label={`Open ${f.contact.name}`}
                  >
                    <ChevronRight className="h-4 w-4 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="awm-label mb-3 inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Ripe to reach out
          </h2>
          {contacts.isPending || touchpoints.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : ripe.length === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-4 text-sm text-fg-muted italic">
              No prospects showing strong engagement signals right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {ripePreview.map((r) => (
                <li
                  key={r.contact.id}
                  className="rounded-sm border border-border bg-bg-surface p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/contacts/${r.contact.id}`}
                      className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                    >
                      {r.contact.name}
                    </Link>
                    <p className="text-xs text-fg-muted mt-0.5">
                      {r.positiveCount} positive touchpoint
                      {r.positiveCount === 1 ? "" : "s"} in last 30d ·{" "}
                      {r.daysSinceLast === 0
                        ? "talked today"
                        : `${r.daysSinceLast}d since last`}
                    </p>
                  </div>
                  <span className="font-condensed text-[10px] font-bold tracking-wider text-gold tabular-nums bg-gold/[0.12] border border-gold-dim rounded-sm px-1.5 py-0.5 leading-none">
                    {r.score}
                  </span>
                  <Link
                    to={`/contacts/${r.contact.id}`}
                    aria-label={`Open ${r.contact.name}`}
                  >
                    <ChevronRight className="h-4 w-4 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="awm-label mb-3 inline-flex items-center gap-1.5">
            <Cake className="h-3 w-3" />
            Coming up this week
          </h2>
          {contacts.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : birthdays.length === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-4 text-sm text-fg-muted italic">
              No birthdays in the next 7 days.
            </p>
          ) : (
            <ul className="space-y-2">
              {birthdays.map((b) => (
                <li
                  key={b.contact.id}
                  className="rounded-sm border border-border bg-bg-surface p-3 flex items-center gap-3"
                >
                  <div className="flex flex-col items-center min-w-12">
                    <span className="text-xs text-fg/85 tabular-nums">
                      {b.monthDay}
                    </span>
                    <span className="text-[10px] text-fg-subtle uppercase tracking-wider mt-0.5">
                      {b.daysUntil === 0
                        ? "today"
                        : b.daysUntil === 1
                          ? "tomorrow"
                          : `in ${b.daysUntil}d`}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/contacts/${b.contact.id}`}
                      className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                    >
                      {b.contact.name}
                    </Link>
                    {b.ageTurning !== null && (
                      <p className="text-xs text-fg-muted mt-0.5">
                        turning {b.ageTurning}
                      </p>
                    )}
                  </div>
                  <Link
                    to={`/contacts/${b.contact.id}`}
                    aria-label={`Open ${b.contact.name}`}
                  >
                    <ChevronRight className="h-4 w-4 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="xl:col-span-2">
          <h2 className="awm-label mb-3">Logged touchpoints · last 3 days</h2>
          {recentTouchpoints.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : (recentTouchpoints.data?.length ?? 0) === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-4 text-sm text-fg-muted italic">
              No touchpoints logged in the last 3 days.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentTouchpoints.data!.map((t) => (
                <li
                  key={t.id}
                  className="rounded-sm border border-border bg-bg-surface p-3"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      to={`/contacts/${t.contact_id}`}
                      className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                    >
                      {t.contact_name}
                    </Link>
                    {t.type && (
                      <Badge tone="neutral">{TOUCHPOINT_TYPE_LABEL[t.type as TouchpointType] ?? humanize(t.type)}</Badge>
                    )}
                    {t.sentiment && (
                      <Badge tone={SENTIMENT_TONE[t.sentiment as Sentiment]}>
                        {humanize(t.sentiment)}
                      </Badge>
                    )}
                    <span className="ml-auto text-[10px] uppercase tracking-wider font-condensed text-fg-subtle">
                      {formatRelative(t.created_at)}
                    </span>
                  </div>
                  {t.summary && (
                    <p className="mt-1.5 text-sm text-fg/85 leading-snug">
                      {t.summary}
                    </p>
                  )}
                  {t.raw_input && t.raw_input !== t.summary && (
                    <p className="mt-1 text-xs text-fg-subtle italic">
                      “{t.raw_input}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>

      <QuickLogDialog open={quickOpen} onOpenChange={setQuickOpen} />
    </div>
  );
}
