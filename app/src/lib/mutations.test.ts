import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the modules mutations.ts imports from. vi.mock is hoisted, so this
// runs before the mutations import below.
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/kit", () => ({
  updateContactBatch: vi.fn(),
}));

import { getDb } from "@/lib/db";
import { updateContactBatch } from "@/lib/kit";
import {
  nowIso,
  updateContact,
  updateTouchpointNotes,
  MAX_TOUCHPOINT_NOTE_LENGTH,
} from "@/lib/mutations";

// Fake Database for updateTouchpointNotes (the one remaining direct-SQL path).
function fakeDb(opts: { rowsAffected?: number } = {}) {
  const calls: { method: "execute" | "select"; sql: string; args: unknown[] }[] = [];
  return {
    calls,
    select: vi.fn(async (sql: string, args: unknown[] = []) => {
      calls.push({ method: "select", sql, args });
      return [] as unknown[];
    }),
    execute: vi.fn(async (sql: string, args: unknown[] = []) => {
      calls.push({ method: "execute", sql, args });
      return { rowsAffected: opts.rowsAffected ?? 1 };
    }),
  };
}

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(updateContactBatch).mockReset();
});

describe("nowIso", () => {
  it("returns a YYYY-MM-DDTHH:MM:SS string with no microseconds", () => {
    const out = nowIso();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe("updateContact (shells out to Python kit)", () => {
  it("returns early with no-op result when changes are empty", async () => {
    const result = await updateContact({ id: "c_test_1", changes: {} });

    expect(result.ok).toBe(true);
    expect(result.changedFields).toEqual([]);
    expect(updateContactBatch).not.toHaveBeenCalled();
  });

  it("returns early when every change is undefined (filtered out)", async () => {
    const result = await updateContact({
      id: "c_test_1",
      changes: { phone: undefined, email: undefined },
    });

    expect(result.changedFields).toEqual([]);
    expect(updateContactBatch).not.toHaveBeenCalled();
  });

  it("shells out with the kit-shaped payload (id, updates map, app source)", async () => {
    vi.mocked(updateContactBatch).mockResolvedValue({
      ok: true,
      contact_id: "c_test_1",
      contact_name: "Hayden Wang",
      diff: {
        phone: { from: "", to: "+65 9123 4567", action: "replaced" },
        email: { from: "old@x.com", to: "new@x.com", action: "replaced" },
      },
      message: "Updated 2 field(s) on Hayden Wang.",
    });

    const result = await updateContact({
      id: "c_test_1",
      changes: { phone: "+65 9123 4567", email: "new@x.com" },
    });

    expect(updateContactBatch).toHaveBeenCalledTimes(1);
    const [contactId, updates, options] = vi.mocked(updateContactBatch).mock
      .calls[0];
    expect(contactId).toBe("c_test_1");
    expect(updates).toEqual({
      phone: "+65 9123 4567",
      email: "new@x.com",
    });
    // The Settings "last Hermes event" filter excludes source LIKE 'app:%'.
    // App edits must keep that prefix so they don't pollute the Hermes feed.
    expect(options?.source).toBe("app:edit-contact");
    expect(result.changedFields.sort()).toEqual(["email", "phone"]);
  });

  it("returns the changedFields the kit actually changed (not the proposed set)", async () => {
    // The kit's diff may exclude fields whose proposed value matched the
    // existing one — phone was changed, email was a no-op.
    vi.mocked(updateContactBatch).mockResolvedValue({
      ok: true,
      contact_id: "c_test_1",
      contact_name: "Hayden Wang",
      diff: {
        phone: { from: "", to: "+65 9123 4567", action: "replaced" },
      },
      message: "Updated 1 field(s) on Hayden Wang.",
    });

    const result = await updateContact({
      id: "c_test_1",
      changes: { phone: "+65 9123 4567", email: "already-correct@x.com" },
    });

    expect(result.changedFields).toEqual(["phone"]);
  });

  it("stringifies non-string values (TS allows them via Partial<ContactRow>)", async () => {
    vi.mocked(updateContactBatch).mockResolvedValue({
      ok: true,
      contact_id: "c_test_1",
      contact_name: "Hayden Wang",
      diff: { notes: { from: "", to: "5", action: "replaced" } },
      message: "Updated 1 field(s).",
    });

    // Force a non-string through (in real usage these come from form inputs
    // so always strings, but the contract should handle it).
    await updateContact({
      id: "c_test_1",
      changes: { notes: 5 as unknown as string },
    });

    const [, updates] = vi.mocked(updateContactBatch).mock.calls[0];
    expect(updates).toEqual({ notes: "5" });
  });

  it("propagates kit errors (validation rejection bubbles up)", async () => {
    vi.mocked(updateContactBatch).mockRejectedValue(
      new Error(
        "relationship_os.py update-contact exited 1: Field 'type' is derived from touchpoints"
      )
    );

    await expect(
      updateContact({
        id: "c_test_1",
        // type is HERMES_MANAGED; the kit will reject it.
        changes: { type: "prospect" } as never,
      })
    ).rejects.toThrow(/Field 'type' is derived from touchpoints/);
  });
});

describe("updateTouchpointNotes", () => {
  it("throws on missing id", async () => {
    vi.mocked(getDb).mockResolvedValue(fakeDb() as never);
    await expect(updateTouchpointNotes("", "x")).rejects.toThrow(
      /Missing touchpoint id/
    );
    await expect(updateTouchpointNotes("   ", "x")).rejects.toThrow(
      /Missing touchpoint id/
    );
  });

  it("throws when notes exceed the 8000-char guard", async () => {
    vi.mocked(getDb).mockResolvedValue(fakeDb() as never);
    const big = "x".repeat(MAX_TOUCHPOINT_NOTE_LENGTH + 1);
    await expect(updateTouchpointNotes("tp_1", big)).rejects.toThrow(
      /must be 8,000 characters or fewer/
    );
  });

  it("accepts notes at exactly the boundary", async () => {
    const db = fakeDb({ rowsAffected: 1 });
    vi.mocked(getDb).mockResolvedValue(db as never);
    const max = "x".repeat(MAX_TOUCHPOINT_NOTE_LENGTH);
    await expect(updateTouchpointNotes("tp_1", max)).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalled();
  });

  it("throws when the touchpoint row doesn't exist (rowsAffected=0)", async () => {
    const db = fakeDb({ rowsAffected: 0 });
    vi.mocked(getDb).mockResolvedValue(db as never);
    await expect(updateTouchpointNotes("tp_missing", "ok")).rejects.toThrow(
      /Touchpoint tp_missing not found/
    );
  });
});
