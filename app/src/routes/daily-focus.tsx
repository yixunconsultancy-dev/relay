import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, History, Save, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import {
  useAllReminders,
  fetchDailyFocus,
  queryKeys,
  useSettings,
} from "@/lib/queries";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/mutations";
import type { DailyFocusRow } from "@/lib/schema";
import { formatShortDate, todayIso } from "@/lib/format";

interface FocusFormState {
  priority_1: string;
  priority_2: string;
  priority_3: string;
  reflection: string;
  bottlenecks: string;
}

function makeForm(source: DailyFocusRow | null | undefined): FocusFormState {
  return {
    priority_1: source?.priority_1 ?? "",
    priority_2: source?.priority_2 ?? "",
    priority_3: source?.priority_3 ?? "",
    reflection: source?.reflection ?? "",
    bottlenecks: source?.bottlenecks ?? "",
  };
}

async function fetchHistory(): Promise<DailyFocusRow[]> {
  const db = await getDb();
  return db.select<DailyFocusRow[]>(
    `SELECT "date","priority_1","priority_2","priority_3","follow_ups_due","reflection","bottlenecks","created_at"
       FROM daily_focus
      ORDER BY date DESC
      LIMIT 30`
  );
}

async function saveDailyFocus(
  date: string,
  form: FocusFormState,
  followUpsDue: string
): Promise<void> {
  const db = await getDb();
  const existing = await fetchDailyFocus(date);
  if (existing) {
    await db.execute(
      `UPDATE daily_focus
          SET priority_1 = $1,
              priority_2 = $2,
              priority_3 = $3,
              follow_ups_due = $4,
              reflection = $5,
              bottlenecks = $6
        WHERE date = $7`,
      [
        form.priority_1,
        form.priority_2,
        form.priority_3,
        followUpsDue,
        form.reflection,
        form.bottlenecks,
        date,
      ]
    );
  } else {
    await db.execute(
      `INSERT INTO daily_focus
         ("date","priority_1","priority_2","priority_3","follow_ups_due","reflection","bottlenecks","created_at")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        date,
        form.priority_1,
        form.priority_2,
        form.priority_3,
        followUpsDue,
        form.reflection,
        form.bottlenecks,
        nowIso(),
      ]
    );
  }
}

export function DailyFocusRoute() {
  const settings = useSettings();
  const today = todayIso(settings.data?.timezone);
  const queryClient = useQueryClient();
  const reminders = useAllReminders();
  const todayFocus = useQuery({
    queryKey: queryKeys.dailyFocus(today),
    queryFn: () => fetchDailyFocus(today),
  });
  const history = useQuery({
    queryKey: ["daily-focus", "history"],
    queryFn: fetchHistory,
  });

  const [form, setForm] = useState<FocusFormState>(() => makeForm(undefined));
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (seededFor.current === today) return;
    if (todayFocus.data !== undefined) {
      setForm(makeForm(todayFocus.data));
      seededFor.current = today;
      setLastSavedAt(null);
    }
  }, [today, todayFocus.data]);

  const followUpsDue = useMemo(() => {
    if (!reminders.data) return "";
    return reminders.data
      .filter(
        (r) => r.status === "pending" && r.due_date && r.due_date <= today
      )
      .map((r) => `${r.contact_name}: ${r.context || "(no context)"}`)
      .join("\n");
  }, [reminders.data, today]);

  const initial = useMemo(() => makeForm(todayFocus.data), [todayFocus.data]);
  const dirty = useMemo(
    () =>
      (Object.keys(form) as (keyof FocusFormState)[]).some(
        (k) => form[k] !== initial[k]
      ),
    [form, initial]
  );

  const save = useMutation({
    mutationFn: () => saveDailyFocus(today, form, followUpsDue),
    onSuccess: () => {
      setLastSavedAt(new Date());
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyFocus(today) });
      queryClient.invalidateQueries({ queryKey: ["daily-focus", "history"] });
    },
  });

  function update<K extends keyof FocusFormState>(key: K, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function discard() {
    setForm(initial);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="awm-label flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3" />
              {formatShortDate(today)}
            </p>
            <h1 className="mt-1 font-display text-3xl font-light text-fg leading-none">
              Daily Focus
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              Plan your top three, reflect on yesterday, name today's
              bottlenecks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastSavedAt && !dirty && (
              <span className="text-xs text-status-success">
                Saved {lastSavedAt.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={discard}
              disabled={!dirty || save.isPending}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              variant="gold"
              size="sm"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save className="h-3.5 w-3.5" />
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {save.isError && (
          <p className="mt-2 text-xs text-status-error">
            {(save.error as Error).message ?? String(save.error)}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-8 py-6 grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8">
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-4">
            {(["priority_1", "priority_2", "priority_3"] as const).map(
              (key, i) => (
                <Field
                  key={key}
                  label={`Priority ${i + 1}`}
                  htmlFor={`df-${key}`}
                >
                  <Input
                    id={`df-${key}`}
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    placeholder={
                      i === 0
                        ? "Most important outcome today"
                        : "Optional"
                    }
                  />
                </Field>
              )
            )}
          </div>

          <Field
            label="Follow-ups due (auto-populated)"
            hint="Pulled from today's pending reminders. Read-only."
          >
            <Textarea readOnly rows={4} value={followUpsDue || "(none)"} />
          </Field>

          <Field label="Reflection" htmlFor="df-reflection">
            <Textarea
              id="df-reflection"
              rows={5}
              value={form.reflection}
              onChange={(e) => update("reflection", e.target.value)}
              placeholder="End-of-day reflection or journal entry."
            />
          </Field>

          <Field label="Bottlenecks" htmlFor="df-bottlenecks">
            <Textarea
              id="df-bottlenecks"
              rows={4}
              value={form.bottlenecks}
              onChange={(e) => update("bottlenecks", e.target.value)}
              placeholder="Recurring issues you noticed today."
            />
          </Field>
        </section>

        <aside>
          <h2 className="awm-label inline-flex items-center gap-1.5 mb-3">
            <History className="h-3 w-3" />
            History
          </h2>
          {history.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : (history.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-fg-subtle italic">No prior entries.</p>
          ) : (
            <ol className="space-y-2">
              {history.data!.map((row) => (
                <li
                  key={row.date}
                  className="rounded-sm border border-border bg-bg-surface p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-body text-sm font-semibold text-fg tabular-nums">
                      {formatShortDate(row.date)}
                    </span>
                    {row.date === today && (
                      <span className="awm-label text-gold">Today</span>
                    )}
                  </div>
                  {row.priority_1 && (
                    <p className="mt-1 text-xs text-fg/85 leading-snug">
                      <span className="text-gold font-bold">①</span>{" "}
                      {row.priority_1}
                    </p>
                  )}
                  {row.priority_2 && (
                    <p className="mt-0.5 text-xs text-fg/80 leading-snug">
                      <span className="text-gold/70 font-bold">②</span>{" "}
                      {row.priority_2}
                    </p>
                  )}
                  {row.priority_3 && (
                    <p className="mt-0.5 text-xs text-fg/75 leading-snug">
                      <span className="text-gold/50 font-bold">③</span>{" "}
                      {row.priority_3}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
