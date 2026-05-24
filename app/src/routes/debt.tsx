import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  useAllReminders,
  useAllTouchpoints,
  useContacts,
} from "@/lib/queries";
import {
  bucketByCategory,
  computeDebt,
  DEBT_CATEGORY_LABEL,
  DEBT_CATEGORY_TONE,
  type DebtCategory,
  type DebtFlag,
} from "@/lib/debt";

const COLUMN_ORDER: DebtCategory[] = [
  "at_risk",
  "unfollowed_action",
  "cooling",
  "stale_prospect",
];

const COLUMN_HINT: Record<DebtCategory, string> = {
  at_risk: "Client, no touchpoint in 60+ days",
  unfollowed_action: "Promised follow-up, no reminder created",
  cooling: "Warm or hot, no touchpoint in 30+ days",
  stale_prospect: "Prospect, no touchpoint in 14+ days",
};

export function DebtRoute() {
  const contacts = useContacts();
  const touchpoints = useAllTouchpoints();
  const reminders = useAllReminders();

  const flags = useMemo(() => {
    if (!contacts.data || !touchpoints.data || !reminders.data) return [];
    return computeDebt(
      contacts.data,
      touchpoints.data,
      reminders.data,
      new Date()
    );
  }, [contacts.data, touchpoints.data, reminders.data]);

  const buckets = useMemo(() => bucketByCategory(flags), [flags]);

  const loading =
    contacts.isPending || touchpoints.isPending || reminders.isPending;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <p className="awm-label flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Relationship debt
            </p>
            <h1 className="mt-1 font-display text-3xl font-light text-fg leading-none">
              {loading
                ? "Loading…"
                : flags.length === 0
                  ? "Inbox zero."
                  : `${flags.length} debt item${flags.length === 1 ? "" : "s"}`}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              Momentum decay + promised follow-ups that didn't get logged
              as reminders.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {COLUMN_ORDER.map((cat) => (
          <DebtColumn
            key={cat}
            category={cat}
            flags={buckets[cat]}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}

interface ColumnProps {
  category: DebtCategory;
  flags: DebtFlag[];
  loading: boolean;
}

function DebtColumn({ category, flags, loading }: ColumnProps) {
  return (
    <section className="flex flex-col min-w-0">
      <header className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="awm-label">{DEBT_CATEGORY_LABEL[category]}</h2>
          <span className="font-display text-2xl font-light text-gold tabular-nums leading-none">
            {flags.length}
          </span>
        </div>
        <p className="text-[10px] text-fg-subtle mt-1">
          {COLUMN_HINT[category]}
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-fg-muted italic">Loading…</p>
      ) : flags.length === 0 ? (
        <p className="rounded-sm border border-border bg-bg-surface/40 p-3 text-xs text-fg-muted italic">
          Empty.
        </p>
      ) : (
        <ul className="space-y-2">
          {flags.map((f) => (
            <li
              key={f.touchpoint?.id ?? f.contact.id}
              className="rounded-sm border border-border bg-bg-raised/40 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/contacts/${f.contact.id}`}
                    className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors block"
                  >
                    {f.contact.name}
                  </Link>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {f.daysSince === null
                      ? "no touchpoint logged"
                      : `${f.daysSince} day${f.daysSince === 1 ? "" : "s"} ago`}
                  </p>
                  {f.touchpoint?.action_items && (
                    <p className="mt-2 text-xs text-fg/80 leading-snug border-l-2 border-gold-dim pl-2">
                      {f.touchpoint.action_items}
                    </p>
                  )}
                </div>
                <Badge tone={DEBT_CATEGORY_TONE[category]}>
                  {DEBT_CATEGORY_LABEL[category]}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px]">
                <Link
                  to={`/contacts/${f.contact.id}`}
                  className="text-fg-muted hover:text-gold transition-colors"
                >
                  Open contact →
                </Link>
                {f.touchpoint && (
                  <Link
                    to={`/touchpoints/${f.touchpoint.id}`}
                    className="text-fg-muted hover:text-gold transition-colors inline-flex items-center gap-1"
                  >
                    <ChevronRight className="h-3 w-3" />
                    Original touchpoint
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
