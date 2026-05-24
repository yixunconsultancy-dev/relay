import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Bell, ChevronRight, Search } from "lucide-react";

import {
  Badge,
  CONTACT_TYPE_TONE,
  STAGE_TONE,
} from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useContacts,
  usePendingReminderCountByContact,
} from "@/lib/queries";
import {
  CONTACT_TYPES,
  RELATIONSHIP_STAGES,
  STAGE_URGENCY,
  type ContactType,
  type RelationshipStage,
} from "@/lib/enums";
import { formatShortDate, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sort = "name" | "last_touch" | "stage_urgency";

export function ContactsRoute() {
  const contacts = useContacts();
  const reminderCounts = usePendingReminderCountByContact();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<ContactType>>(new Set());
  const [stageFilter, setStageFilter] = useState<Set<RelationshipStage>>(
    new Set()
  );
  const [pendingOnly, setPendingOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<Sort>("name");

  const rows = useMemo(() => {
    if (!contacts.data) return [];
    const q = search.trim().toLowerCase();
    const counts = reminderCounts.data ?? {};
    const filtered = contacts.data.filter((c) => {
      const archivedAt = (c.archived_at || "").trim();
      if (!showArchived && archivedAt) return false;
      if (typeFilter.size && !typeFilter.has(c.type as ContactType))
        return false;
      if (
        stageFilter.size &&
        !stageFilter.has(c.relationship_stage as RelationshipStage)
      )
        return false;
      if (pendingOnly && !(counts[c.id] > 0)) return false;
      if (q) {
        const haystack = [
          c.name,
          c.occupation,
          c.company,
          c.email,
          c.phone,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sort === "last_touch") {
        // Most recent first; empty values sink.
        const av = a.last_touch_date || "";
        const bv = b.last_touch_date || "";
        if (!av && !bv) return 0;
        if (!av) return 1;
        if (!bv) return -1;
        return bv.localeCompare(av);
      }
      // stage_urgency: descending.
      const au = STAGE_URGENCY[a.relationship_stage as RelationshipStage] ?? -1;
      const bu = STAGE_URGENCY[b.relationship_stage as RelationshipStage] ?? -1;
      return bu - au;
    });
  }, [contacts.data, reminderCounts.data, search, typeFilter, stageFilter, pendingOnly, showArchived, sort]);

  const totalShown = rows.length;
  const total = contacts.data?.length ?? 0;
  const archivedCount = useMemo(
    () => (contacts.data ?? []).filter((c) => (c.archived_at || "").trim()).length,
    [contacts.data]
  );

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-6 sticky top-0 z-10">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-light text-fg leading-none">
              Contacts
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              {totalShown.toLocaleString()} of {total.toLocaleString()} shown
            </p>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, role, company…"
              className="pl-9"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <FilterChips
            label="Type"
            options={CONTACT_TYPES}
            selected={typeFilter}
            onToggle={(opt) =>
              setTypeFilter((prev) => toggle(prev, opt as ContactType))
            }
          />
          <FilterChips
            label="Stage"
            options={RELATIONSHIP_STAGES}
            selected={stageFilter}
            onToggle={(opt) =>
              setStageFilter((prev) => toggle(prev, opt as RelationshipStage))
            }
          />
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider font-condensed font-bold text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-gold"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
            />
            <Bell className="h-3 w-3" />
            Has pending reminders
          </label>
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-xs uppercase tracking-wider font-condensed font-bold text-fg-muted cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-gold"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <Archive className="h-3 w-3" />
              Show archived ({archivedCount})
            </label>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="awm-label">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="bg-bg-surface border border-border rounded-sm px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-gold/60"
            >
              <option value="name">Name (A–Z)</option>
              <option value="last_touch">Last touch (recent)</option>
              <option value="stage_urgency">Stage urgency</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {contacts.isPending ? (
          <p className="p-8 text-sm text-fg-muted">Loading contacts…</p>
        ) : contacts.isError ? (
          <p className="p-8 text-sm text-status-error">
            Could not load contacts: {String(contacts.error)}
          </p>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            {total === 0 ? (
              <>
                <p className="font-display text-xl text-fg-muted">
                  No contacts yet.
                </p>
                <p className="mt-2 text-sm text-fg-subtle max-w-md mx-auto">
                  Send a message to your Hermes Telegram bot like
                  <span className="text-fg/80 italic">
                    {" "}"Had coffee with Anna today, follow up next Friday"
                  </span>
                  {" "}and a contact will appear here.
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-xl text-fg-muted">
                  No contacts match these filters.
                </p>
                <p className="mt-2 text-sm text-fg-subtle">
                  Clear search or adjust filters to see your{" "}
                  {total.toLocaleString()} contact{total === 1 ? "" : "s"}.
                </p>
              </>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-bg-base/95 backdrop-blur">
              <tr className="awm-label border-b border-border text-left">
                <th className="px-8 py-3 font-condensed">Name</th>
                <th className="px-3 py-3 font-condensed">Type</th>
                <th className="px-3 py-3 font-condensed">Stage</th>
                <th className="px-3 py-3 font-condensed">Last touch</th>
                <th className="px-3 py-3 font-condensed text-right">Reminders</th>
                <th className="px-8 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/40 hover:bg-bg-surface/60 transition-colors"
                >
                  <td className="px-8 py-3">
                    <Link
                      to={`/contacts/${c.id}`}
                      className="font-body text-sm font-semibold text-fg hover:text-gold transition-colors"
                    >
                      {c.name}
                    </Link>
                    {(c.occupation || c.company) && (
                      <div className="text-xs text-fg-muted mt-0.5">
                        {[c.occupation, c.company].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {c.type && (
                      <Badge tone={CONTACT_TYPE_TONE[c.type as ContactType]}>
                        {humanize(c.type)}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {c.relationship_stage && (
                      <Badge
                        tone={STAGE_TONE[c.relationship_stage as RelationshipStage]}
                      >
                        {humanize(c.relationship_stage)}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-fg/80 tabular-nums">
                    {formatShortDate(c.last_touch_date)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <PendingCount id={c.id} counts={reminderCounts.data} />
                  </td>
                  <td className="px-8 py-3">
                    <Link to={`/contacts/${c.id}`} aria-label={`Open ${c.name}`}>
                      <ChevronRight className="h-4 w-4 text-fg-subtle" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PendingCount({
  id,
  counts,
}: {
  id: string;
  counts: Record<string, number> | undefined;
}) {
  const n = counts?.[id] ?? 0;
  if (!n) return <span className="text-fg-subtle">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-gold">
      <Bell className="h-3 w-3" />
      {n}
    </span>
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
    <div className="flex items-center gap-1.5">
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
