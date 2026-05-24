import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  Plus,
  Sun,
} from "lucide-react";

import {
  Badge,
  PRIORITY_TONE,
  SENTIMENT_TONE,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DailyScoreCard } from "@/components/daily-score-card";
import { QuickLogDialog } from "@/components/quick-log-dialog";
import {
  useAllReminders,
  useAllTouchpoints,
  useContacts,
  useSettings,
} from "@/lib/queries";
import { completeReminder } from "@/lib/kit";
import {
  computeDebt,
  DEBT_CATEGORY_LABEL,
  DEBT_CATEGORY_TONE,
} from "@/lib/debt";
import { getDb } from "@/lib/db";
import type { TouchpointRow } from "@/lib/schema";
import {
  formatShortDate,
  formatRelative,
  humanize,
  todayIso,
} from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import type {
  ReminderPriority,
  Sentiment,
} from "@/lib/enums";

async function fetchTouchpointsForDate(date: string): Promise<TouchpointRow[]> {
  const db = await getDb();
  // Exclude `import` touchpoints — those are bulk-import rows, not real
  // consultant-client interactions, and shouldn't show up on the Today
  // dashboard.
  return db.select<TouchpointRow[]>(
    `SELECT "id","contact_id","contact_name","date","type","sentiment","summary","topics","action_items","meeting_number","raw_input","notes","created_at"
       FROM touchpoints
      WHERE date = $1 AND type <> 'import'
      ORDER BY created_at DESC`,
    [date]
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeRoute() {
  const reminders = useAllReminders();
  const contacts = useContacts();
  const touchpoints = useAllTouchpoints();
  const settings = useSettings();
  const today = todayIso(settings.data?.timezone);
  const todaysTouchpoints = useQuery({
    queryKey: ["touchpoints", "today", today],
    queryFn: () => fetchTouchpointsForDate(today),
  });
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
          <div className="flex items-end gap-3 flex-wrap">
            <DailyScoreCard today={today} />
            <Button
              variant="gold"
              size="md"
              onClick={() => setQuickOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Quick log
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 grid grid-cols-1 xl:grid-cols-2 gap-8">
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
              Relationship debt
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

        <section className="xl:col-span-2">
          <h2 className="awm-label mb-3">Today's logged touchpoints</h2>
          {todaysTouchpoints.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : (todaysTouchpoints.data?.length ?? 0) === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-4 text-sm text-fg-muted italic">
              Nothing logged yet today.
            </p>
          ) : (
            <ul className="space-y-2">
              {todaysTouchpoints.data!.map((t) => (
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
                      <Badge tone="neutral">{humanize(t.type)}</Badge>
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

      <QuickLogDialog open={quickOpen} onOpenChange={setQuickOpen} />
    </div>
  );
}
