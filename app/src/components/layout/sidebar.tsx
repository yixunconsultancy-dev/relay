import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Network,
  Sun,
  Users,
  Bell,
  CalendarDays,
  CheckCircle2,
  FileText,
  Settings,
  Sparkles,
  WifiOff,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { useSyncStatus } from "@/lib/sync-status";
import {
  useAllReminders,
  useAllTouchpoints,
  useContacts,
  usePendingClarifications,
} from "@/lib/queries";
import { computeDebt } from "@/lib/debt";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Sun;
  enabled: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Today", icon: Sun, enabled: true },
  { to: "/contacts", label: "Contacts", icon: Users, enabled: true },
  { to: "/graph", label: "Graph", icon: Network, enabled: true },
  { to: "/reminders", label: "Reminders", icon: Bell, enabled: true },
  { to: "/debt", label: "Debt", icon: AlertTriangle, enabled: true },
  { to: "/clarifications", label: "Clarify", icon: AlertCircle, enabled: true },
  { to: "/daily-focus", label: "Daily Focus", icon: CalendarDays, enabled: true },
  { to: "/documents", label: "Documents", icon: FileText, enabled: true },
  { to: "/activity", label: "Activity", icon: Activity, enabled: true },
  { to: "/settings", label: "Settings", icon: Settings, enabled: true },
];

/** Hook that returns the current debt item count. Used for the sidebar badge.
 *  All three queries are cached by TanStack Query so this is cheap. */
function useDebtCount(): number {
  const contacts = useContacts();
  const touchpoints = useAllTouchpoints();
  const reminders = useAllReminders();
  return useMemo(() => {
    if (!contacts.data || !touchpoints.data || !reminders.data) return 0;
    return computeDebt(
      contacts.data,
      touchpoints.data,
      reminders.data,
      new Date()
    ).length;
  }, [contacts.data, touchpoints.data, reminders.data]);
}

function useClarificationCount(): number {
  const q = usePendingClarifications();
  return q.data?.length ?? 0;
}

export function Sidebar() {
  const sync = useSyncStatus();
  const debtCount = useDebtCount();
  const clarificationCount = useClarificationCount();
  const lastSyncedAt = sync.lastSyncedAt
    ? new Date(sync.lastSyncedAt).toISOString()
    : null;
  const syncLabel =
    sync.state === "paused"
      ? "Sync paused"
      : lastSyncedAt
        ? `Synced ${formatRelative(lastSyncedAt)}`
        : sync.state === "ok"
          ? "Sync watching"
          : "Sync starting";

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-bg-surface">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <Sparkles className="h-4 w-4 text-gold" />
        <div className="flex flex-col">
          <span className="font-condensed text-base font-bold tracking-wider text-fg leading-none">
            AWMOS
          </span>
          <span className="awm-label mt-1">AWM</span>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          if (!item.enabled) {
            return (
              <div
                key={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-sm px-3 py-2 text-sm",
                  "text-fg-subtle cursor-not-allowed select-none"
                )}
                title="Available in a later phase"
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
            );
          }
          const badge =
            item.to === "/debt" && debtCount > 0
              ? debtCount
              : item.to === "/clarifications" && clarificationCount > 0
                ? clarificationCount
                : null;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-bg-raised text-fg border-l-2 border-gold"
                    : "text-fg/70 hover:bg-bg-raised hover:text-fg"
                )
              }
              end={item.to === "/"}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {badge !== null && (
                <span className="font-condensed text-[10px] font-bold tracking-wider text-gold tabular-nums bg-gold/[0.15] border border-gold-dim rounded-sm px-1.5 py-0.5 leading-none">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-3 text-[10px] uppercase tracking-wider text-fg-subtle space-y-2">
        <div
          className={cn(
            "flex items-center gap-2 normal-case tracking-normal",
            sync.state === "paused" ? "text-status-error" : "text-fg-subtle"
          )}
          title={sync.lastError ?? syncLabel}
        >
          {sync.state === "paused" ? (
            <WifiOff className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span className="truncate">{syncLabel}</span>
        </div>
        <div>MVP build</div>
      </div>
    </aside>
  );
}
