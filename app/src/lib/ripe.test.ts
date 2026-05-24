import { describe, it, expect } from "vitest";

import type { ContactRow, TouchpointRow } from "@/lib/schema";
import {
  computeRipeSignals,
  RIPE_MIN_POSITIVE,
  RIPE_WINDOW_DAYS,
  RIPE_RECENCY_DAYS,
} from "@/lib/ripe";

const TODAY = new Date("2026-05-25T12:00:00");

function isoDaysAgo(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function contact(
  partial: Partial<ContactRow> & { id: string; name: string }
): ContactRow {
  return {
    id: partial.id,
    name: partial.name,
    type: partial.type ?? "prospect",
    relationship_stage: partial.relationship_stage ?? "warm",
    phone: "",
    email: "",
    occupation: "",
    company: "",
    birthday: "",
    family: "",
    policies: "",
    financial_concerns: "",
    interests: "",
    referral_source: "",
    next_review_date: "",
    last_touch_date: partial.last_touch_date ?? "",
    notes: "",
    archived_at: partial.archived_at ?? "",
    created_at: "",
    updated_at: "",
  } as ContactRow;
}

function tp(
  partial: Partial<TouchpointRow> & { id: string; contact_id: string; date: string }
): TouchpointRow {
  return {
    id: partial.id,
    contact_id: partial.contact_id,
    contact_name: "",
    date: partial.date,
    type: partial.type ?? "meeting",
    sentiment: partial.sentiment ?? "neutral",
    summary: "",
    topics: "",
    action_items: "",
    meeting_number: "",
    raw_input: "",
    notes: "",
    created_at: "",
  } as TouchpointRow;
}

describe("computeRipeSignals — happy path", () => {
  it("flags a prospect with 2+ positive touchpoints in the window and recent activity", () => {
    const c = contact({ id: "c1", name: "Warm Prospect", type: "prospect" });
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(2), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(10), sentiment: "positive" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].contact.id).toBe("c1");
    expect(out[0].positiveCount).toBe(2);
    expect(out[0].daysSinceLast).toBe(2);
  });

  it("scores recency-bonus contacts higher than older ones", () => {
    const c1 = contact({ id: "c1", name: "Very Recent", type: "prospect" });
    const c2 = contact({ id: "c2", name: "Older Recent", type: "prospect" });
    const out = computeRipeSignals(
      [c1, c2],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(2), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(5), sentiment: "positive" }),
        tp({ id: "t3", contact_id: "c2", date: isoDaysAgo(15), sentiment: "positive" }),
        tp({ id: "t4", contact_id: "c2", date: isoDaysAgo(20), sentiment: "positive" }),
      ],
      TODAY
    );
    expect(out[0].contact.id).toBe("c1"); // recency bonus pushes it to top
  });
});

describe("computeRipeSignals — exclusions", () => {
  it("excludes clients (already converted, not 'ripe to reach out')", () => {
    const c = contact({ id: "c1", name: "Already Client", type: "client" });
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(2), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(10), sentiment: "positive" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("excludes archived contacts", () => {
    const c = contact({
      id: "c1",
      name: "Archived",
      type: "prospect",
      archived_at: "2026-04-01T10:00:00",
    });
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(2), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(10), sentiment: "positive" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("requires at least RIPE_MIN_POSITIVE positive touchpoints", () => {
    const c = contact({ id: "c1", name: "Only One Positive", type: "prospect" });
    expect(RIPE_MIN_POSITIVE).toBe(2);
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(2), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(10), sentiment: "neutral" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("ignores positive touchpoints OUTSIDE the window", () => {
    const c = contact({ id: "c1", name: "Old Positives", type: "prospect" });
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(40), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(50), sentiment: "positive" }),
        // Recent neutral touchpoint to keep them inside the recency window
        tp({ id: "t3", contact_id: "c1", date: isoDaysAgo(5), sentiment: "neutral" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("excludes contacts whose last touchpoint is past RIPE_RECENCY_DAYS", () => {
    const c = contact({ id: "c1", name: "Stale", type: "prospect" });
    expect(RIPE_RECENCY_DAYS).toBe(21);
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(25), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(28), sentiment: "positive" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("ignores future-dated touchpoints", () => {
    const c = contact({ id: "c1", name: "Future", type: "prospect" });
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(-3), sentiment: "positive" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(-5), sentiment: "positive" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });
});

describe("computeRipeSignals — sentiment thresholds", () => {
  it("counts positive only; neutral and negative do not qualify a contact", () => {
    const c = contact({ id: "c1", name: "Mixed", type: "prospect" });
    const out = computeRipeSignals(
      [c],
      [
        tp({ id: "t1", contact_id: "c1", date: isoDaysAgo(2), sentiment: "neutral" }),
        tp({ id: "t2", contact_id: "c1", date: isoDaysAgo(5), sentiment: "negative" }),
        tp({ id: "t3", contact_id: "c1", date: isoDaysAgo(8), sentiment: "neutral" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });
});

describe("computeRipeSignals — window constants are defensible", () => {
  it("RIPE_WINDOW_DAYS is reasonable (~30) and recency is tighter (~21)", () => {
    expect(RIPE_WINDOW_DAYS).toBeGreaterThan(RIPE_RECENCY_DAYS);
  });
});
