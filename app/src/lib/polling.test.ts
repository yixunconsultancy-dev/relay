import { describe, it, expect, vi, beforeEach } from "vitest";

import type { EventRow } from "@/lib/schema";

// polling.ts transitively imports @/lib/db which imports @tauri-apps/plugin-sql
// and @tauri-apps/api/core — neither resolves in a node test env. Stub them
// before any module that touches them loads.
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
  resetDbConnection: vi.fn(),
}));
vi.mock("@/lib/sync-status", () => ({
  getSyncStatus: vi.fn(() => ({ state: "ok", lastSyncedAt: null })),
  publishSyncStatus: vi.fn(),
}));

// We want the REAL queryKeys from queries.ts, but stubbed fetch functions.
// importActual gets the real module, then we spread + override.
vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>(
    "@/lib/queries"
  );
  return {
    ...actual,
    fetchEventsSince: vi.fn(),
    fetchLatestEventSeq: vi.fn(),
  };
});

import { dispatchInvalidations } from "@/lib/polling";
import { queryKeys } from "@/lib/queries";

function fakeQueryClient() {
  const calls: { queryKey: readonly unknown[] }[] = [];
  return {
    calls,
    invalidateQueries: vi.fn((arg: { queryKey: readonly unknown[] }) => {
      calls.push({ queryKey: arg.queryKey });
    }),
  };
}

function evt(partial: Partial<EventRow>): EventRow {
  return {
    rowid: 1,
    id: "e_20260524_0001",
    timestamp: "2026-05-24T10:00:00",
    kind: "touchpoint_logged",
    contact_id: "c_test_1",
    subject_id: "",
    payload: "{}",
    source: "log-touchpoint",
    ...partial,
  } as EventRow;
}

function calledWith(
  client: ReturnType<typeof fakeQueryClient>,
  key: readonly unknown[]
): boolean {
  return client.calls.some(
    (c) => JSON.stringify(c.queryKey) === JSON.stringify(key)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispatchInvalidations — single event kinds", () => {
  it("touchpoint_logged invalidates contacts, touchpoints, reminders, per-contact, daily-focus", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "touchpoint_logged", contact_id: "c_1" })],
      client as never
    );

    expect(calledWith(client, queryKeys.contacts)).toBe(true);
    expect(calledWith(client, queryKeys.touchpoints)).toBe(true);
    expect(calledWith(client, queryKeys.reminders)).toBe(true);
    expect(calledWith(client, queryKeys.contact("c_1"))).toBe(true);
    expect(calledWith(client, queryKeys.touchpointsByContact("c_1"))).toBe(true);
    expect(calledWith(client, queryKeys.remindersByContact("c_1"))).toBe(true);
    expect(calledWith(client, ["reminders", "pending-counts"])).toBe(true);
    expect(calledWith(client, ["daily-focus"])).toBe(true);
  });

  it("reminder_completed invalidates reminders + pending-counts + daily-focus only", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "reminder_completed", contact_id: "c_1" })],
      client as never
    );

    expect(calledWith(client, queryKeys.reminders)).toBe(true);
    expect(calledWith(client, ["reminders", "pending-counts"])).toBe(true);
    expect(calledWith(client, queryKeys.remindersByContact("c_1"))).toBe(true);
    // Should NOT invalidate touchpoints or contacts list.
    expect(calledWith(client, queryKeys.touchpoints)).toBe(false);
    expect(calledWith(client, queryKeys.contacts)).toBe(false);
  });

  it("reminder_snoozed and reminder_cancelled behave like reminder_completed", () => {
    for (const kind of ["reminder_snoozed", "reminder_cancelled"] as const) {
      const client = fakeQueryClient();
      dispatchInvalidations([evt({ kind, contact_id: "c_1" })], client as never);
      expect(calledWith(client, queryKeys.reminders)).toBe(true);
      expect(calledWith(client, queryKeys.contacts)).toBe(false);
    }
  });

  it("contact_created invalidates the contacts list (and daily-focus)", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "contact_created", contact_id: "c_new" })],
      client as never
    );
    expect(calledWith(client, queryKeys.contacts)).toBe(true);
    expect(calledWith(client, queryKeys.contact("c_new"))).toBe(true);
    // No touchpoint or reminder invalidation needed.
    expect(calledWith(client, queryKeys.touchpoints)).toBe(false);
  });

  it("contact_updated invalidates contacts list + the affected contact detail", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "contact_updated", contact_id: "c_1" })],
      client as never
    );
    expect(calledWith(client, queryKeys.contacts)).toBe(true);
    expect(calledWith(client, queryKeys.contact("c_1"))).toBe(true);
  });

  it("contact_merged invalidates contacts + touchpoints + reminders (data moved across)", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "contact_merged", contact_id: "c_into" })],
      client as never
    );
    expect(calledWith(client, queryKeys.contacts)).toBe(true);
    expect(calledWith(client, queryKeys.touchpoints)).toBe(true);
    expect(calledWith(client, queryKeys.reminders)).toBe(true);
  });

  it("contact_archived / contact_unarchived invalidate contacts list", () => {
    for (const kind of ["contact_archived", "contact_unarchived"] as const) {
      const client = fakeQueryClient();
      dispatchInvalidations(
        [evt({ kind, contact_id: "c_1" })],
        client as never
      );
      expect(calledWith(client, queryKeys.contacts)).toBe(true);
    }
  });

  it("contact_renamed invalidates contacts + touchpoints + reminders (name denormalized)", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "contact_renamed", contact_id: "c_1" })],
      client as never
    );
    expect(calledWith(client, queryKeys.contacts)).toBe(true);
    expect(calledWith(client, queryKeys.touchpoints)).toBe(true);
    expect(calledWith(client, queryKeys.reminders)).toBe(true);
  });

  it("reminder_duplicate_skipped does NOT invalidate reminders or touchpoints", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [
        evt({
          kind: "reminder_duplicate_skipped",
          contact_id: "",
          source: "log-touchpoint",
        }),
      ],
      client as never
    );
    // Only the always-invalidated daily-focus should fire; no contact_id
    // means no per-contact invalidations either.
    expect(calledWith(client, queryKeys.reminders)).toBe(false);
    expect(calledWith(client, queryKeys.touchpoints)).toBe(false);
    expect(calledWith(client, queryKeys.contacts)).toBe(false);
    expect(calledWith(client, ["daily-focus"])).toBe(true);
  });

  it("policy_* events rely on touchedContacts to invalidate the contact detail", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "policy_created", contact_id: "c_with_policy" })],
      client as never
    );
    // policy_* doesn't directly invalidate any policies key today; the
    // per-contact contact detail picks up the change instead.
    expect(calledWith(client, queryKeys.contact("c_with_policy"))).toBe(true);
  });
});

describe("dispatchInvalidations — batched events", () => {
  it("collects multiple contact_ids and invalidates each", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [
        evt({ kind: "touchpoint_logged", contact_id: "c_1" }),
        evt({ kind: "contact_updated", contact_id: "c_2" }),
        evt({ kind: "reminder_completed", contact_id: "c_3" }),
      ],
      client as never
    );

    expect(calledWith(client, queryKeys.contact("c_1"))).toBe(true);
    expect(calledWith(client, queryKeys.contact("c_2"))).toBe(true);
    expect(calledWith(client, queryKeys.contact("c_3"))).toBe(true);
  });

  it("deduplicates per-contact invalidations (only one call per contact key)", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [
        evt({ kind: "touchpoint_logged", contact_id: "c_1" }),
        evt({ kind: "contact_updated", contact_id: "c_1" }),
        evt({ kind: "reminder_completed", contact_id: "c_1" }),
      ],
      client as never
    );

    const contactDetailCalls = client.calls.filter(
      (c) =>
        c.queryKey.length === 2 &&
        c.queryKey[0] === "contacts" &&
        c.queryKey[1] === "c_1"
    );
    expect(contactDetailCalls).toHaveLength(1);
  });

  it("invalidates daily-focus exactly once regardless of event count", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [
        evt({ kind: "touchpoint_logged", contact_id: "c_1" }),
        evt({ kind: "reminder_completed", contact_id: "c_2" }),
        evt({ kind: "contact_created", contact_id: "c_3" }),
      ],
      client as never
    );
    const dailyFocusCalls = client.calls.filter(
      (c) => c.queryKey.length === 1 && c.queryKey[0] === "daily-focus"
    );
    expect(dailyFocusCalls).toHaveLength(1);
  });

  it("handles an empty events array without throwing", () => {
    const client = fakeQueryClient();
    expect(() => dispatchInvalidations([], client as never)).not.toThrow();
    // daily-focus is always invalidated, even on empty input.
    expect(calledWith(client, ["daily-focus"])).toBe(true);
  });

  it("doesn't invalidate per-contact queries when contact_id is empty", () => {
    const client = fakeQueryClient();
    dispatchInvalidations(
      [evt({ kind: "touchpoint_logged", contact_id: "" })],
      client as never
    );

    // No contact-specific invalidations.
    const perContactCalls = client.calls.filter(
      (c) =>
        (c.queryKey[0] === "contacts" && c.queryKey.length === 2) ||
        c.queryKey[1] === "by-contact"
    );
    expect(perContactCalls).toHaveLength(0);
    // Global queries still invalidated.
    expect(calledWith(client, queryKeys.contacts)).toBe(true);
    expect(calledWith(client, queryKeys.touchpoints)).toBe(true);
  });
});
