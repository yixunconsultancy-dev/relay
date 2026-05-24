import { useEffect, useState } from "react";

export type SyncState = "starting" | "ok" | "paused";

export interface SyncStatus {
  state: SyncState;
  consecutiveFailures: number;
  lastError: string | null;
  lastSyncedAt: number | null;
}

const SYNC_STATUS_EVENT = "awmos:sync-status";

let currentStatus: SyncStatus = {
  state: "starting",
  consecutiveFailures: 0,
  lastError: null,
  lastSyncedAt: null,
};

function sameStatus(a: SyncStatus, b: SyncStatus): boolean {
  return (
    a.state === b.state &&
    a.consecutiveFailures === b.consecutiveFailures &&
    a.lastError === b.lastError &&
    a.lastSyncedAt === b.lastSyncedAt
  );
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function publishSyncStatus(next: SyncStatus): void {
  if (sameStatus(currentStatus, next)) return;
  currentStatus = next;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SyncStatus>(SYNC_STATUS_EVENT, { detail: currentStatus })
  );
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(currentStatus);

  useEffect(() => {
    function onStatus(event: Event) {
      setStatus((event as CustomEvent<SyncStatus>).detail);
    }
    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
  }, []);

  return status;
}
