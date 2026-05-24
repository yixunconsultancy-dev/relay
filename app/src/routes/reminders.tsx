import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock,
  X,
  Calendar as CalendarIcon,
  ListChecks,
} from "lucide-react";

import {
  Badge,
  PRIORITY_TONE,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAllReminders, useSettings } from "@/lib/queries";
import {
  cancelReminder,
  completeReminder,
  snoozeReminder,
} from "@/lib/kit";
import {
  REMINDER_PRIORITIES,
  REMINDER_TYPES,
  type ReminderPriority,
  type ReminderType,
} from "@/lib/enums";
import { formatShortDate, formatRelative, humanize, todayIso } from "@/lib/format";
import type { ReminderRow } from "@/lib/schema";
import { cn } from "@/lib/utils";

type ColumnKey = "due_today" | "pending" | "snoozed" | "done";

const COLUMN_LABEL: Record<ColumnKey, string> = {
  due_today: "Due today",
  pending: "Pending",
  snoozed: "Snoozed",
  done: "Done (last 7d)",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function bucketize(r: ReminderRow, today: string): ColumnKey | null {
  if (r.status === "pending") {
    if (r.due_date && r.due_date <= today) return "due_today";
    return "pending";
  }
  if (r.status === "snoozed") return "snoozed";
  if (r.status === "done") {
    if (!r.completed_at) return "done";
    const ago = Date.now() - Date.parse(r.completed_at);
    return ago <= SEVEN_DAYS_MS ? "done" : null;
  }
  // cancelled or unknown — hidden by default
  return null;
}

export function RemindersRoute() {
  const reminders = useAllReminders();
  const settings = useSettings();
  const queryClient = useQueryClient();

  const [contactFilter, setContactFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Set<ReminderPriority>>(
    new Set()
  );
  const [typeFilter, setTypeFilter] = useState<Set<ReminderType>>(new Set());

  const today = todayIso(settings.data?.timezone);

  const filtered = useMemo(() => {
    if (!reminders.data) return [];
    const q = contactFilter.trim().toLowerCase();
    return reminders.data.filter((r) => {
      if (q && !r.contact_name.toLowerCase().includes(q)) return false;
      if (
        priorityFilter.size &&
        !priorityFilter.has(r.priority as ReminderPriority)
      )
        return false;
      if (typeFilter.size && !typeFilter.has(r.type as ReminderType))
        return false;
      return true;
    });
  }, [reminders.data, contactFilter, priorityFilter, typeFilter]);

  const columns = useMemo(() => {
    const out: Record<ColumnKey, ReminderRow[]> = {
      due_today: [],
      pending: [],
      snoozed: [],
      done: [],
    };
    for (const r of filtered) {
      const bucket = bucketize(r, today);
      if (bucket) out[bucket].push(r);
    }
    const byUrgency = (a: ReminderRow, b: ReminderRow) => {
      const prio: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const pa = prio[a.priority] ?? 99;
      const pb = prio[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.due_date || "").localeCompare(b.due_date || "");
    };
    out.due_today.sort(byUrgency);
    out.pending.sort(byUrgency);
    out.snoozed.sort((a, b) =>
      (a.snoozed_until || a.due_date).localeCompare(b.snoozed_until || b.due_date)
    );
    out.done.sort((a, b) =>
      (b.completed_at || "").localeCompare(a.completed_at || "")
    );
    return out;
  }, [filtered, today]);

  // Visible == sum of all four bucket lengths. `filtered` may include
  // reminders that bucketize() drops (cancelled, very old done), so counting
  // filtered.length here would overstate the visible board.
  const visibleCount =
    columns.due_today.length +
    columns.pending.length +
    columns.snoozed.length +
    columns.done.length;
  const hiddenCount = filtered.length - visibleCount;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
  }

  const complete = useMutation({
    mutationFn: (id: string) => completeReminder(id),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelReminder(id),
    onSuccess: invalidate,
  });
  const snooze = useMutation({
    mutationFn: (input: { id: string; until: string }) =>
      snoozeReminder(input.id, input.until),
    onSuccess: invalidate,
  });

  const isBusy =
    complete.isPending || cancel.isPending || snooze.isPending;
  const lastError =
    complete.error || cancel.error || snooze.error || reminders.error;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              Reminders
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              {visibleCount === 1 ? "1 reminder" : `${visibleCount} reminders`}
              {hiddenCount > 0 && (
                <span className="text-fg-subtle">
                  {" "}
                  · {hiddenCount} hidden (cancelled or older than 7d)
                </span>
              )}
            </p>
          </div>
          <Input
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
            placeholder="Filter by contact name…"
            className="w-72"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <FilterChips
            label="Priority"
            options={REMINDER_PRIORITIES}
            selected={priorityFilter}
            onToggle={(opt) =>
              setPriorityFilter((prev) => toggle(prev, opt as ReminderPriority))
            }
          />
          <FilterChips
            label="Type"
            options={REMINDER_TYPES}
            selected={typeFilter}
            onToggle={(opt) =>
              setTypeFilter((prev) => toggle(prev, opt as ReminderType))
            }
          />
        </div>
        {lastError && (
          <p className="mt-3 text-xs text-status-error">
            {String((lastError as Error).message ?? lastError)}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-auto px-8 py-6">
        {reminders.isPending ? (
          <p className="text-sm text-fg-muted">Loading reminders…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {(Object.keys(COLUMN_LABEL) as ColumnKey[]).map((col) => (
              <Column
                key={col}
                title={COLUMN_LABEL[col]}
                tone={col}
                rows={columns[col]}
                onComplete={(id) => complete.mutate(id)}
                onCancel={(id) => cancel.mutate(id)}
                onSnooze={(id, until) => snooze.mutate({ id, until })}
                busyId={
                  complete.isPending
                    ? (complete.variables as string)
                    : cancel.isPending
                      ? (cancel.variables as string)
                      : snooze.isPending
                        ? snooze.variables?.id
                        : undefined
                }
                isBusy={isBusy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Column({
  title,
  tone,
  rows,
  onComplete,
  onCancel,
  onSnooze,
  busyId,
  isBusy,
}: {
  title: string;
  tone: ColumnKey;
  rows: ReminderRow[];
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  busyId: string | undefined;
  isBusy: boolean;
}) {
  const accent: Record<ColumnKey, string> = {
    due_today: "border-status-error/40",
    pending: "border-gold-dim",
    snoozed: "border-status-info/40",
    done: "border-status-success/40",
  };

  return (
    <section
      className={cn(
        "rounded-sm border bg-bg-surface min-h-32 flex flex-col",
        accent[tone]
      )}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-base/40">
        <h3 className="awm-label">{title}</h3>
        <span className="text-xs tabular-nums text-fg-muted">{rows.length}</span>
      </header>
      <div className="flex-1 p-2 space-y-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-xs text-fg-subtle italic text-center">
            Empty
          </p>
        ) : (
          rows.map((r) => (
            <ReminderCard
              key={r.id}
              row={r}
              onComplete={onComplete}
              onCancel={onCancel}
              onSnooze={onSnooze}
              isBusy={isBusy && busyId === r.id}
              showActions={tone !== "done"}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ReminderCard({
  row: r,
  onComplete,
  onCancel,
  onSnooze,
  isBusy,
  showActions,
}: {
  row: ReminderRow;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  isBusy: boolean;
  showActions: boolean;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState("");

  function defaultSnoozeDate() {
    const days =
      r.priority === "high" ? 1 : r.priority === "medium" ? 3 : 7;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  return (
    <article className="rounded-sm border border-border bg-bg-raised/40 p-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {r.priority && (
          <Badge tone={PRIORITY_TONE[r.priority as ReminderPriority]}>
            {humanize(r.priority)}
          </Badge>
        )}
        {r.type && (
          <span className="text-[10px] uppercase tracking-wider font-condensed text-fg-muted">
            {humanize(r.type)}
          </span>
        )}
        <span className="ml-auto text-[10px] text-fg-subtle tabular-nums">
          {formatShortDate(r.snoozed_until || r.due_date)}
        </span>
      </div>
      <Link
        to={`/contacts/${r.contact_id}`}
        className="block mt-1.5 font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
      >
        {r.contact_name}
      </Link>
      <p className="text-xs text-fg-subtle">
        {formatRelative(r.snoozed_until || r.due_date)}
      </p>
      {r.context && (
        <p className="mt-2 text-xs text-fg/80 leading-snug">{r.context}</p>
      )}

      {showActions && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="primary"
            disabled={isBusy}
            onClick={() => onComplete(r.id)}
          >
            <Check className="h-3 w-3" />
            Done
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isBusy}
            onClick={() => {
              setSnoozeDate(defaultSnoozeDate());
              setSnoozeOpen((v) => !v);
            }}
          >
            <Clock className="h-3 w-3" />
            Snooze
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={isBusy}
            onClick={() => onCancel(r.id)}
          >
            <X className="h-3 w-3" />
            Cancel
          </Button>
        </div>
      )}

      {snoozeOpen && (
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-border bg-bg-surface p-2">
          <CalendarIcon className="h-3.5 w-3.5 text-fg-muted" />
          <input
            type="date"
            value={snoozeDate}
            onChange={(e) => setSnoozeDate(e.target.value)}
            className="bg-transparent text-xs text-fg outline-none flex-1 min-w-0"
          />
          <Button
            size="sm"
            variant="gold"
            disabled={isBusy || !snoozeDate}
            onClick={() => {
              onSnooze(r.id, snoozeDate);
              setSnoozeOpen(false);
            }}
          >
            <ListChecks className="h-3 w-3" />
            Snooze
          </Button>
        </div>
      )}
    </article>
  );
}

function FilterChips<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  selected: Set<T>;
  onToggle: (opt: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="awm-label mr-1">{label}</span>
      {options.map((opt) => {
        const isOn = selected.has(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={cn(
              "rounded-sm border px-2 py-1 font-condensed text-[10px] font-bold uppercase tracking-[0.08em] transition-colors",
              isOn
                ? "border-gold bg-gold/15 text-gold"
                : "border-border text-fg-muted hover:border-border-strong hover:text-fg"
            )}
          >
            {humanize(opt)}
          </button>
        );
      })}
    </div>
  );
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
