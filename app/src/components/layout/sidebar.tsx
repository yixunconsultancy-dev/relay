import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Network,
  LayoutDashboard,
  Users,
  Bell,
  CalendarDays,
  CheckCircle2,
  FileText,
  GripVertical,
  Settings,
  Sparkles,
  Trash2,
  WifiOff,
  TrendingUp,
  Star,
  BookOpen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { useSyncStatus } from "@/lib/sync-status";
import {
  useAllReminders,
  useAllTouchpoints,
  useContacts,
  usePendingClarifications,
  useTrashedContacts,
} from "@/lib/queries";
import { computeDebt } from "@/lib/debt";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { to: "/journal", label: "Journal", icon: BookOpen, enabled: true },
  { to: "/contacts", label: "Clients", icon: Users, enabled: true },
  { to: "/graph", label: "Network", icon: Network, enabled: true },
  { to: "/investments", label: "Investments", icon: TrendingUp, enabled: true },
  { to: "/reminders", label: "Reminders", icon: Bell, enabled: true },
  { to: "/debt", label: "At Risk", icon: AlertTriangle, enabled: true },
  { to: "/showcase", label: "Showcase", icon: Star, enabled: true },
  { to: "/daily-focus", label: "Daily Focus", icon: CalendarDays, enabled: true },
  { to: "/documents", label: "Documents", icon: FileText, enabled: true },
  { to: "/activity", label: "Activity", icon: Activity, enabled: true },
  { to: "/clarifications", label: "Clarify", icon: AlertCircle, enabled: true },
  { to: "/trash", label: "Trash", icon: Trash2, enabled: true },
  { to: "/settings", label: "Settings", icon: Settings, enabled: true },
];

// ── Sidebar order persistence ────────────────────────────────────────────────
//
// The user can drag-and-drop sidebar items to reorder them. We persist the
// chosen order in localStorage so it survives app restarts. The stored value
// is an array of `to` paths — when the canonical NAV list above changes (new
// route added, route removed), we reconcile: known paths render in the
// saved order, anything new is appended at the end so it still shows up.

const NAV_ORDER_STORAGE_KEY = "hermes:sidebar-order:v1";

function loadSavedOrder(defaultPaths: string[]): string[] {
  if (typeof window === "undefined") return defaultPaths;
  try {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) return defaultPaths;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultPaths;
    const knownPaths = new Set(defaultPaths);
    const seen = new Set<string>();
    const result: string[] = [];
    // Saved paths first (in saved order), filtered to ones still in NAV.
    for (const p of parsed) {
      if (typeof p === "string" && knownPaths.has(p) && !seen.has(p)) {
        result.push(p);
        seen.add(p);
      }
    }
    // Append any newly-added paths that weren't in the saved order yet.
    for (const p of defaultPaths) {
      if (!seen.has(p)) result.push(p);
    }
    return result;
  } catch {
    return defaultPaths;
  }
}

function saveOrder(paths: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(paths));
  } catch {
    // Storage full / disabled — silently degrade; order resets next session.
  }
}

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

function useTrashCount(): number {
  const q = useTrashedContacts();
  return q.data?.length ?? 0;
}

export function Sidebar() {
  const sync = useSyncStatus();
  const debtCount = useDebtCount();
  const clarificationCount = useClarificationCount();
  const trashCount = useTrashCount();

  // ── Reorderable nav state ──────────────────────────────────────────────────
  // `order` holds the current ordering of NAV paths. Initialised from
  // localStorage so the user's chosen order persists across app restarts.
  const defaultPaths = useMemo(() => NAV.map((n) => n.to), []);
  const navByPath = useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const item of NAV) map.set(item.to, item);
    return map;
  }, []);

  const [order, setOrder] = useState<string[]>(() => loadSavedOrder(defaultPaths));
  // Mirror `order` into a ref so pointer event listeners (which are bound
  // once at mount with `[]` deps) can read the current value without
  // re-binding on every change. Writing to a ref during render is allowed
  // by React and survives StrictMode's double-render unchanged.
  const orderRef = useRef(order);
  orderRef.current = order;
  // Drag state is split between a ref and minimal state. The ref holds the
  // authoritative drag info (startY, fromIndex, active flag) that pointer
  // event handlers read and mutate — refs survive React.StrictMode's double
  // invocation of state updaters, which would otherwise cause our reorder
  // logic to run twice. The two pieces of useState below only drive
  // re-renders for visual feedback (dimming the source row, drawing the
  // gold drop line).
  const dragInfoRef = useRef<{
    fromIndex: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // Set true on pointerup when an active drag just completed, so the
  // synthetic click that follows is swallowed at the nav-level capture
  // handler instead of triggering NavLink navigation. Ref instead of state
  // because the click handler closes over a stale render by the time it
  // fires.
  const justDraggedRef = useRef(false);

  // If NAV changes between sessions (route added/removed), reconcile with the
  // saved list so new routes appear and stale ones drop out.
  useEffect(() => {
    setOrder((prev) => {
      const reconciled = loadSavedOrder(defaultPaths);
      // Cheap shallow check — only update if something actually moved.
      if (
        reconciled.length === prev.length &&
        reconciled.every((p, i) => p === prev[i])
      ) {
        return prev;
      }
      return reconciled;
    });
  }, [defaultPaths]);

  /** Move the item at `from` to position `to`, persist, and return new order.
   *
   *  Note: deliberately uses `setOrder(newValue)` with a direct value (not an
   *  updater function) so that React.StrictMode's double-invocation of state
   *  updaters can't cause this reorder to run twice and corrupt the list.
   *  Reads current order from `orderRef` instead of `order` so it's safe to
   *  call from pointer listeners that were bound once at mount. */
  function reorder(from: number, to: number) {
    const prev = orderRef.current;
    if (from === to || from < 0 || from >= prev.length) return;
    const next = prev.slice();
    const [moved] = next.splice(from, 1);
    const insertAt = to > from ? to - 1 : to;
    const clamped = Math.max(0, Math.min(insertAt, next.length));
    next.splice(clamped, 0, moved);
    setOrder(next);
    saveOrder(next);
  }

  // ── Pointer-driven drag-and-drop ──────────────────────────────────────────
  // We intentionally do NOT use HTML5 draggable / dragstart / drop events.
  // Inside Tauri's WebView (and some WKWebView builds) those events are
  // intercepted by the native window for file-drop handling, so they never
  // reach the React tree. Pointer events are universal and work identically
  // in every browser and webview.
  //
  // CRITICAL: All side effects (calling `reorder`, mutating refs, etc.)
  // happen INSIDE plain event handlers — never inside a setState updater.
  // React.StrictMode double-invokes state updater functions in dev, which
  // would cause the reorder to run twice and corrupt the order.
  //
  // Flow:
  //  1. pointerdown on a row → seed dragInfoRef with fromIndex + startY.
  //  2. pointermove past 4px threshold → mark active, dim the source row,
  //     start drawing the gold drop indicator.
  //  3. pointermove during active drag → recompute target index from the
  //     row currently under the cursor (via document.elementFromPoint).
  //  4. pointerup → if active, commit the reorder; if still pending (i.e.
  //     never moved), do nothing — the click on the NavLink runs naturally
  //     and navigation happens.
  useEffect(() => {
    function computeTargetIndex(clientX: number, clientY: number): number | null {
      // Find the nav row under the cursor, if any.
      const elt = document.elementFromPoint(clientX, clientY);
      if (!elt) return null;
      const rowElt = elt.closest("[data-nav-index]") as HTMLElement | null;
      if (!rowElt) return null;
      const idx = Number(rowElt.dataset.navIndex);
      if (Number.isNaN(idx)) return null;
      const rect = rowElt.getBoundingClientRect();
      // Above vs below midpoint decides whether to drop before or after.
      return clientY < rect.top + rect.height / 2 ? idx : idx + 1;
    }

    function onMove(e: PointerEvent) {
      const info = dragInfoRef.current;
      if (!info) return;
      const dy = Math.abs(e.clientY - info.startY);
      if (!info.active && dy > 4) {
        info.active = true;
        setDragIndex(info.fromIndex);
      }
      if (info.active) {
        setOverIndex(computeTargetIndex(e.clientX, e.clientY));
      }
    }

    function onUp(e: PointerEvent) {
      const info = dragInfoRef.current;
      dragInfoRef.current = null;
      setDragIndex(null);
      setOverIndex(null);
      if (!info || !info.active) return;
      // Flag the synthetic click that fires next so the nav-level capture
      // handler swallows it instead of routing to a NavLink.
      justDraggedRef.current = true;
      const target = computeTargetIndex(e.clientX, e.clientY);
      if (target === null) return;
      reorder(info.fromIndex, target);
    }

    function onCancel() {
      dragInfoRef.current = null;
      setDragIndex(null);
      setOverIndex(null);
    }

    // Listeners are mounted once for the lifetime of the sidebar. They are
    // cheap when idle (early-return if dragInfoRef is null), and binding
    // them once avoids any re-bind churn or StrictMode double-effect
    // re-runs from interfering mid-drag.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            CRONOS
          </span>
          <span className="awm-label mt-1">CLIENT HUB</span>
        </div>
      </div>
      <nav
        className="flex-1 px-2 py-3 space-y-0.5"
        onClickCapture={(e) => {
          // Swallow the post-drag synthetic click. The browser dispatches
          // `click` on the nearest common ancestor of pointerdown and
          // pointerup — when the user drags from one row and drops on
          // another, that's the <nav> itself, not either row. Capturing
          // here ensures we always cancel before NavLink sees it.
          if (justDraggedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            justDraggedRef.current = false;
          }
        }}
      >
        {order.map((path, index) => {
          const item = navByPath.get(path);
          if (!item) return null;
          const Icon = item.icon;
          const isDragging = dragIndex === index;
          // Drop indicator: above row if overIndex equals this row's index;
          // below the very last row if overIndex equals order.length.
          const showDropAbove = overIndex === index && dragIndex !== null && dragIndex !== index;
          const showDropBelow =
            overIndex === order.length &&
            index === order.length - 1 &&
            dragIndex !== null;
          if (!item.enabled) {
            return (
              <div key={item.to} data-nav-index={index}>
                {showDropAbove && <div className="mx-2 h-px bg-gold" aria-hidden="true" />}
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-sm pl-1 pr-3 py-2 text-sm",
                    "text-fg-subtle cursor-not-allowed select-none",
                    isDragging && "opacity-40"
                  )}
                  title="Available in a later phase"
                >
                  <span className="w-4" aria-hidden="true" />
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
              </div>
            );
          }
          const badge =
            item.to === "/debt" && debtCount > 0
              ? debtCount
              : item.to === "/clarifications" && clarificationCount > 0
                ? clarificationCount
                : item.to === "/trash" && trashCount > 0
                  ? trashCount
                  : null;
          return (
            <div
              key={item.to}
              data-nav-index={index}
              onPointerDown={(e) => {
                // Left-click only; ignore right-click + middle-click.
                if (e.button !== 0) return;
                // Seed the ref; window-level pointermove listener (mounted
                // once at component mount) reads from this ref to drive the
                // drag. We don't call setState here because the user may
                // just be clicking — only after the move threshold is
                // crossed does the listener flip into "active drag" mode.
                dragInfoRef.current = {
                  fromIndex: index,
                  startY: e.clientY,
                  active: false,
                };
              }}
              className={cn(
                "relative select-none",
                isDragging && "opacity-40"
              )}
            >
              {showDropAbove && <div className="mx-2 h-px bg-gold" aria-hidden="true" />}
              <NavLink
                to={item.to}
                draggable={false}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-2 rounded-sm pl-1 pr-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-bg-raised text-fg border-l-2 border-gold"
                      : "text-fg/70 hover:bg-bg-raised hover:text-fg",
                    dragIndex !== null && "cursor-grabbing"
                  )
                }
                end={item.to === "/"}
              >
                <GripVertical
                  className="h-4 w-4 text-fg-subtle/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                  aria-hidden="true"
                />
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {badge !== null && (
                  <span className="font-condensed text-[10px] font-bold tracking-wider text-gold tabular-nums bg-gold/[0.15] border border-gold-dim rounded-sm px-1.5 py-0.5 leading-none">
                    {badge}
                  </span>
                )}
              </NavLink>
              {showDropBelow && <div className="mx-2 h-px bg-gold" aria-hidden="true" />}
            </div>
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
        <div>Cronos v1</div>
      </div>
    </aside>
  );
}
