// Event-poller: every 3s, read new rows from the events table and dispatch
// targeted TanStack Query invalidations. Uses SQLite's `data_version` PRAGMA
// as a cheap "did anything change" guard before doing the full SELECT.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getDb } from "@/lib/db";
import { fetchEventsSince, fetchLatestEventSeq, queryKeys } from "@/lib/queries";
import type { EventRow } from "@/lib/schema";
import { getSyncStatus, publishSyncStatus } from "@/lib/sync-status";

const POLL_INTERVAL_MS = 3000;
const SYNC_FAILURE_BANNER_THRESHOLD = 3;

async function dataVersion(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ data_version: number }[]>(
    "PRAGMA data_version"
  );
  return rows[0]?.data_version ?? 0;
}

export function dispatchInvalidations(
  events: EventRow[],
  queryClient: ReturnType<typeof useQueryClient>
) {
  const touchedContacts = new Set<string>();
  let reminderTouched = false;
  let touchpointTouched = false;
  let contactListTouched = false;

  for (const e of events) {
    if (e.contact_id) touchedContacts.add(e.contact_id);
    switch (e.kind) {
      case "touchpoint_logged":
        touchpointTouched = true;
        reminderTouched = true; // touchpoint may close/create reminders
        contactListTouched = true; // bumps last_touch_date + stage
        break;
      case "reminder_completed":
      case "reminder_snoozed":
      case "reminder_cancelled":
        reminderTouched = true;
        break;
      case "contact_created":
        contactListTouched = true;
        break;
      case "contact_updated":
        contactListTouched = true;
        break;
      case "contact_merged":
        // Both the surviving and removed contacts touched; safest to invalidate
        // everything contact-shaped plus touchpoints + reminders (which moved).
        contactListTouched = true;
        touchpointTouched = true;
        reminderTouched = true;
        break;
      case "contact_archived":
      case "contact_unarchived":
        contactListTouched = true;
        break;
      case "contact_renamed":
        // contact_name is denormalized onto touchpoints + reminders; refresh both.
        contactListTouched = true;
        touchpointTouched = true;
        reminderTouched = true;
        break;
      case "reminder_duplicate_skipped":
        // No data changed; nothing to invalidate.
        break;
      case "policy_created":
      case "policy_updated":
      case "policy_archived":
        // Policies are per-contact; the affected contact's detail covers it.
        break;
    }
  }

  if (contactListTouched) {
    queryClient.invalidateQueries({ queryKey: queryKeys.contacts });
  }
  for (const id of touchedContacts) {
    queryClient.invalidateQueries({ queryKey: queryKeys.contact(id) });
    queryClient.invalidateQueries({
      queryKey: queryKeys.touchpointsByContact(id),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.remindersByContact(id),
    });
  }
  if (touchpointTouched) {
    queryClient.invalidateQueries({ queryKey: queryKeys.touchpoints });
  }
  if (reminderTouched) {
    queryClient.invalidateQueries({ queryKey: queryKeys.reminders });
    queryClient.invalidateQueries({
      queryKey: ["reminders", "pending-counts"],
    });
  }
  // Always bump the day's daily-focus so follow-ups-due refreshes.
  queryClient.invalidateQueries({ queryKey: ["daily-focus"] });
}

export function useEventPoller(): void {
  const queryClient = useQueryClient();
  const cursorRef = useRef<number | null>(null);
  const lastVersionRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function markHealthy(lastSyncedAt?: number) {
      consecutiveFailuresRef.current = 0;
      const current = getSyncStatus();
      const recoveredFromPaused =
        current.state === "paused" && lastSyncedAt === undefined;
      publishSyncStatus({
        state: "ok",
        consecutiveFailures: 0,
        lastError: null,
        lastSyncedAt: lastSyncedAt ?? (recoveredFromPaused ? Date.now() : current.lastSyncedAt),
      });
    }

    async function tick() {
      if (cancelled) return;
      try {
        if (!initializedRef.current) {
          cursorRef.current = await fetchLatestEventSeq();
          lastVersionRef.current = await dataVersion();
          initializedRef.current = true;
          markHealthy(Date.now());
        } else {
          const ver = await dataVersion();
          // If the DB content hasn't changed since last tick, skip the read.
          if (ver !== lastVersionRef.current) {
            lastVersionRef.current = ver;
            const newEvents = await fetchEventsSince(cursorRef.current);
            if (newEvents.length > 0) {
              const latestSeq = newEvents[newEvents.length - 1].rowid;
              if (typeof latestSeq === "number") {
                cursorRef.current = latestSeq;
              }
              dispatchInvalidations(newEvents, queryClient);
            }
            markHealthy(Date.now());
          } else {
            markHealthy();
          }
        }
      } catch (e) {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= SYNC_FAILURE_BANNER_THRESHOLD) {
          publishSyncStatus({
            state: "paused",
            consecutiveFailures: consecutiveFailuresRef.current,
            lastError: e instanceof Error ? e.message : String(e),
            lastSyncedAt: null,
          });
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [queryClient]);
}
