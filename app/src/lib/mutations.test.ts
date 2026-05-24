import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ContactRow } from "@/lib/schema";

// Mock the modules mutations.ts imports from. vi.mock is hoisted, so this
// runs before the mutations import below.
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  fetchContact: vi.fn(),
}));

import { getDb } from "@/lib/db";
import { fetchContact } from "@/lib/queries";
import {
  nowIso,
  makeId,
  updateContact,
  updateTouchpointNotes,
  MAX_TOUCHPOINT_NOTE_LENGTH,
} from "@/lib/mutations";

// Fake Database with the two methods updateContact / updateTouchpointNotes
// actually call. Each call gets recorded so tests can assert on the argv.
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

function fakeContact(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: "c_test_1",
    name: "Hayden Wang",
    type: "client",
    relationship_stage: "warm",
    phone: "",
    email: "hayden@example.com",
    occupation: "",
    company: "Salesforce",
    birthday: "",
    family: "",
    policies: "",
    financial_concerns: "",
    interests: "",
    referral_source: "",
    next_review_date: "",
    last_touch_date: "2026-05-22",
    notes: "old notes",
    archived_at: "",
    created_at: "2026-01-01T10:00:00",
    updated_at: "2026-05-22T10:00:00",
    ...overrides,
  } as ContactRow;
}

beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(fetchContact).mockReset();
});

describe("nowIso", () => {
  it("returns a YYYY-MM-DDTHH:MM:SS string with no microseconds", () => {
    const out = nowIso();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe("makeId", () => {
  it("produces an e_YYYYMMDD_xxxx shape matching the Python kit", () => {
    const id = makeId("e");
    expect(id).toMatch(/^e_\d{8}_[0-9a-f]{4}$/);
  });

  it("respects the prefix", () => {
    expect(makeId("p")).toMatch(/^p_/);
    expect(makeId("foo")).toMatch(/^foo_/);
  });
});

describe("updateContact", () => {
  it("throws when the contact does not exist", async () => {
    vi.mocked(fetchContact).mockResolvedValue(null);
    await expect(
      updateContact({ id: "missing", changes: { phone: "+65 9123 4567" } })
    ).rejects.toThrow(/Contact missing not found/);
  });

  it("returns early with eventId=null when no editable fields changed", async () => {
    vi.mocked(fetchContact).mockResolvedValue(fakeContact());
    const db = fakeDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    // Phone is unchanged; updated_at not in inputs.
    const result = await updateContact({
      id: "c_test_1",
      changes: { phone: "" },
    });

    expect(result.ok).toBe(true);
    expect(result.eventId).toBeNull();
    expect(result.changedFields).toEqual([]);
    // No BEGIN/UPDATE/INSERT/COMMIT should have been emitted.
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("silently drops non-editable fields (Hermes-managed)", async () => {
    vi.mocked(fetchContact).mockResolvedValue(fakeContact());
    const db = fakeDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await updateContact({
      id: "c_test_1",
      // type / relationship_stage / last_touch_date are Hermes-managed.
      // Cast to any so TS doesn't catch this at compile-time — defense
      // in depth requires the runtime guard, not just types.
      changes: {
        type: "prospect",
        relationship_stage: "cold",
        phone: "+65 9123 4567",
      } as never,
    });

    expect(result.changedFields).toEqual(["phone"]);
    // Only one UPDATE — phone — plus updated_at.
    const updates = db.calls.filter((c) =>
      c.sql.startsWith("UPDATE contacts SET")
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain('"phone"');
    expect(updates[0].sql).toContain('"updated_at"');
    expect(updates[0].sql).not.toContain('"type"');
    expect(updates[0].sql).not.toContain('"relationship_stage"');
  });

  it("emits a contact_updated event with a field diff payload", async () => {
    vi.mocked(fetchContact).mockResolvedValue(
      fakeContact({ phone: "", email: "old@example.com" })
    );
    const db = fakeDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await updateContact({
      id: "c_test_1",
      changes: { phone: "+65 9123 4567", email: "new@example.com" },
    });

    expect(result.changedFields.sort()).toEqual(["email", "phone"]);

    const insert = db.calls.find((c) =>
      c.sql.includes("INSERT INTO events")
    );
    expect(insert).toBeDefined();
    // Event payload is JSON-encoded with diff + field_count.
    const payload = JSON.parse(insert!.args[5] as string);
    expect(payload.field_count).toBe(2);
    expect(payload.diff.phone).toEqual({ from: "", to: "+65 9123 4567" });
    expect(payload.diff.email).toEqual({
      from: "old@example.com",
      to: "new@example.com",
    });
    // source must be the app:edit-contact namespace so the Hermes-status
    // query excludes it.
    expect(insert!.args[6]).toBe("app:edit-contact");
    expect(insert!.args[2]).toBe("contact_updated");
  });

  it("wraps the UPDATE + INSERT in a BEGIN/COMMIT transaction", async () => {
    vi.mocked(fetchContact).mockResolvedValue(fakeContact());
    const db = fakeDb();
    vi.mocked(getDb).mockResolvedValue(db as never);

    await updateContact({
      id: "c_test_1",
      changes: { phone: "+65 9123 4567" },
    });

    const sqls = db.calls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    // Both the UPDATE and the INSERT must land between BEGIN and COMMIT.
    const beginIdx = sqls.indexOf("BEGIN");
    const commitIdx = sqls.indexOf("COMMIT");
    const inner = sqls.slice(beginIdx + 1, commitIdx);
    expect(inner.some((s) => s.startsWith("UPDATE contacts SET"))).toBe(true);
    expect(inner.some((s) => s.includes("INSERT INTO events"))).toBe(true);
  });

  it("rolls back on a mid-transaction error", async () => {
    vi.mocked(fetchContact).mockResolvedValue(fakeContact());
    const db = fakeDb();
    // Fail on the INSERT (the second non-BEGIN call). Use call-count to
    // target it: BEGIN → UPDATE → INSERT → COMMIT, so reject the 3rd call.
    let callIdx = 0;
    db.execute.mockImplementation(async (sql: string) => {
      callIdx += 1;
      db.calls.push({ method: "execute", sql, args: [] });
      if (callIdx === 3) throw new Error("boom");
      return { rowsAffected: 1 };
    });
    vi.mocked(getDb).mockResolvedValue(db as never);

    await expect(
      updateContact({ id: "c_test_1", changes: { phone: "+65 9123 4567" } })
    ).rejects.toThrow(/boom/);

    const sqls = db.calls.map((c) => c.sql);
    expect(sqls).toContain("ROLLBACK");
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
