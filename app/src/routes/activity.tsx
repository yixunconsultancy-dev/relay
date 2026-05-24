import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  fetchActivityEvents,
  useContacts,
  type ActivityFilters,
} from "@/lib/queries";
import { EVENT_KINDS, type EventKind } from "@/lib/enums";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<EventKind, string> = {
  touchpoint_logged: "Touchpoint logged",
  reminder_completed: "Reminder completed",
  reminder_snoozed: "Reminder snoozed",
  reminder_cancelled: "Reminder cancelled",
  reminder_duplicate_skipped: "Duplicate reminder skipped",
  contact_created: "Contact created",
  contact_updated: "Contact updated",
  contact_merged: "Contacts merged",
  contact_archived: "Contact archived",
  contact_unarchived: "Contact unarchived",
  contact_renamed: "Contact renamed",
  policy_created: "Policy added",
  policy_updated: "Policy updated",
  policy_archived: "Policy archived",
  clarification_queued: "Clarification queued",
  clarification_resolved: "Clarification resolved",
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind as EventKind] ?? kind;
}

function formatSource(source: string): string {
  if (!source) return "—";
  const labels: Record<string, string> = {
    "log-touchpoint": "Hermes / log-touchpoint",
    "complete-reminder": "Hermes / complete-reminder",
    "snooze-reminder": "Hermes / snooze-reminder",
    "cancel-reminder": "Hermes / cancel-reminder",
    "merge-contacts": "App / merge",
    "cleanup-duplicates": "Cleanup utility",
    "add-policy": "Hermes / add-policy",
    "update-policy": "Hermes / update-policy",
    "archive-policy": "Hermes / archive-policy",
    "app:edit-contact": "App / edit",
    "app:daily-focus": "App / daily focus",
    "app:settings": "App / settings",
    "hermes:update-contact-fields": "Hermes / update-contact",
    "hermes:queue-clarification": "Hermes / queue clarification",
    "app:resolve-clarification": "App / clarify",
  };
  return labels[source] ?? source;
}

function summarizePayload(payload: string, kind: string): string {
  if (!payload) return "";
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    switch (kind) {
      case "touchpoint_logged":
        return `${parsed.touchpoint_type ?? "?"} · ${parsed.sentiment ?? "?"}`;
      case "reminder_completed":
        return parsed.closed_by_touchpoint_id
          ? `closed by ${parsed.closed_by_touchpoint_id}`
          : "via " + (parsed.closed_via ?? "lifecycle command");
      case "reminder_snoozed":
        return `until ${parsed.snoozed_until ?? "?"}`;
      case "reminder_cancelled":
        return parsed.context ? `context: ${parsed.context}` : "";
      case "reminder_duplicate_skipped":
        return `would have been due ${parsed.would_have_due_date ?? "?"}`;
      case "contact_created":
        return `${parsed.name ?? ""} (${parsed.type ?? "?"})`;
      case "contact_updated": {
        const fc = parsed.field_count;
        return typeof fc === "number" ? `${fc} field(s) changed` : "";
      }
      case "contact_merged":
        return `from ${parsed.merged_from_name ?? "?"} — ${parsed.touchpoints_moved ?? 0} touchpoint(s), ${parsed.reminders_moved ?? 0} reminder(s)`;
      case "policy_created":
        return `${parsed.plan_name ?? "?"} · ${parsed.insurer ?? "?"}`;
      case "policy_updated": {
        const fc = parsed.field_count;
        return typeof fc === "number" ? `${fc} field(s) changed` : "";
      }
      case "policy_archived":
        return `was ${parsed.previous_status ?? "?"}`;
      default:
        return Object.keys(parsed).slice(0, 3).join(", ");
    }
  } catch {
    return payload.slice(0, 80);
  }
}

export function ActivityRoute() {
  const contacts = useContacts();
  const [kindFilter, setKindFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [contactFilter, setContactFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filters: ActivityFilters = useMemo(
    () => ({
      kind: kindFilter || undefined,
      source: sourceFilter || undefined,
      contactId: contactFilter || undefined,
      since: from || undefined,
      until: to || undefined,
      limit: 500,
    }),
    [kindFilter, sourceFilter, contactFilter, from, to]
  );

  const events = useQuery({
    queryKey: ["activity", filters],
    queryFn: () => fetchActivityEvents(filters),
    refetchInterval: 5000,
  });

  // Source dropdown options derived from the loaded events.
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of events.data ?? []) {
      if (e.source) set.add(e.source);
    }
    return Array.from(set).sort();
  }, [events.data]);

  // Search filter applied client-side over the loaded events.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events.data ?? [];
    return (events.data ?? []).filter((e) => {
      const hay = [
        e.kind,
        e.source,
        e.payload,
        e.id,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [events.data, search]);

  function clearFilters() {
    setKindFilter("");
    setSourceFilter("");
    setContactFilter("");
    setFrom("");
    setTo("");
    setSearch("");
  }

  const contactsById = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of contacts.data ?? []) out.set(c.id, c.name);
    return out;
  }, [contacts.data]);

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 border-r border-border bg-bg-surface/40 px-5 py-6 overflow-auto">
        <h2 className="awm-label mb-3">Filters</h2>
        <div className="space-y-4">
          <div>
            <span className="awm-label mb-1.5 block">Kind</span>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="w-full h-9 rounded-sm border border-border bg-bg-surface px-2 text-sm focus:border-gold/60 focus:outline-none"
            >
              <option value="">All kinds</option>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="awm-label mb-1.5 block">Source</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full h-9 rounded-sm border border-border bg-bg-surface px-2 text-sm focus:border-gold/60 focus:outline-none"
            >
              <option value="">All sources</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {formatSource(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="awm-label mb-1.5 block">Contact</span>
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              className="w-full h-9 rounded-sm border border-border bg-bg-surface px-2 text-sm focus:border-gold/60 focus:outline-none"
            >
              <option value="">All contacts</option>
              {(contacts.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="awm-label mb-1.5 block">From</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <span className="awm-label mb-1.5 block">To</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] uppercase tracking-wider font-condensed font-bold text-fg-muted hover:text-fg"
          >
            Clear filters
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <p className="awm-label inline-flex items-center gap-1.5">
                <ActivityIcon className="h-3 w-3" />
                Audit log
              </p>
              <h1 className="mt-1 font-display text-3xl font-light text-fg leading-none">
                Activity
              </h1>
              <p className="mt-2 text-sm text-fg-muted">
                {filtered.length} of {(events.data ?? []).length} events shown
                {events.isFetching && events.data ? " · refreshing…" : ""}
              </p>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search kind, source, payload…"
              className="w-72"
            />
          </div>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          {events.isPending ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : events.isError ? (
            <p className="text-sm text-status-error">
              Could not load events: {String(events.error)}
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-sm border border-border bg-bg-surface p-6 text-sm text-fg-muted italic">
              No activity matches your filters.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((e) => {
                const isExpanded = expandedId === e.id;
                const contactName = e.contact_id ? contactsById.get(e.contact_id) : undefined;
                return (
                  <li
                    key={e.id}
                    className={cn(
                      "rounded-sm border border-border bg-bg-surface transition-colors",
                      isExpanded && "bg-bg-raised/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : e.id)}
                      className="w-full text-left p-3 flex items-start gap-3"
                    >
                      <div className="flex flex-col items-center min-w-24 text-xs">
                        <span className="text-fg/85 tabular-nums">
                          {e.timestamp.slice(11, 19) || "—"}
                        </span>
                        <span className="text-[10px] text-fg-subtle mt-0.5">
                          {e.timestamp.slice(0, 10) || "—"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge tone="neutral">{kindLabel(e.kind)}</Badge>
                          <span className="text-[10px] uppercase tracking-wider font-condensed text-fg-muted">
                            {formatSource(e.source)}
                          </span>
                          {contactName && e.contact_id && (
                            <Link
                              to={`/contacts/${e.contact_id}`}
                              onClick={(ev) => ev.stopPropagation()}
                              className="text-xs text-fg hover:text-gold ml-auto"
                            >
                              {contactName}
                            </Link>
                          )}
                        </div>
                        {summarizePayload(e.payload, e.kind) && (
                          <p className="mt-1 text-xs text-fg/80">
                            {summarizePayload(e.payload, e.kind)}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-fg-subtle">
                          {formatRelative(e.timestamp)} · id {e.id}
                        </p>
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-fg-subtle transition-transform",
                          isExpanded && "rotate-90"
                        )}
                      />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/40 px-3 py-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
                          <span className="text-fg-muted">Event id</span>
                          <span className="font-mono text-fg/85 break-all">{e.id}</span>
                          <span className="text-fg-muted">Subject id</span>
                          <span className="font-mono text-fg/85 break-all">{e.subject_id || "—"}</span>
                          <span className="text-fg-muted">Source</span>
                          <span className="text-fg/85">{e.source || "—"}</span>
                          <span className="text-fg-muted">Timestamp</span>
                          <span className="text-fg/85 tabular-nums">{e.timestamp}</span>
                        </div>
                        <pre className="rounded-sm border border-border bg-bg-base/60 p-3 text-[11px] text-fg/80 whitespace-pre-wrap break-all overflow-auto max-h-64">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(e.payload), null, 2);
                            } catch {
                              return e.payload || "{}";
                            }
                          })()}
                        </pre>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

