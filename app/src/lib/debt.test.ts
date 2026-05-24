import { describe, it, expect } from "vitest";

import type {
  ContactRow,
  ReminderRow,
  TouchpointRow,
} from "@/lib/schema";
import {
  computeDebt,
  bucketByCategory,
  COOLING_THRESHOLD_DAYS,
  AT_RISK_THRESHOLD_DAYS,
  STALE_PROSPECT_THRESHOLD_DAYS,
  UNFOLLOWED_ACTION_GRACE_DAYS,
} from "@/lib/debt";

const TODAY = new Date("2026-05-24T12:00:00");

function isoDaysAgo(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function contact(partial: Partial<ContactRow> & { id: string; name: string }): ContactRow {
  return {
    id: partial.id,
    name: partial.name,
    type: partial.type ?? "client",
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

function touchpoint(partial: Partial<TouchpointRow> & { id: string; contact_id: string }): TouchpointRow {
  return {
    id: partial.id,
    contact_id: partial.contact_id,
    contact_name: partial.contact_name ?? "",
    date: partial.date ?? isoDaysAgo(10),
    type: partial.type ?? "meeting",
    sentiment: "neutral",
    summary: "",
    topics: "",
    action_items: partial.action_items ?? "",
    meeting_number: "",
    raw_input: "",
    notes: "",
    created_at: "",
  } as TouchpointRow;
}

function reminder(partial: Partial<ReminderRow> & { id: string; contact_id: string }): ReminderRow {
  return {
    id: partial.id,
    contact_id: partial.contact_id,
    contact_name: "",
    due_date: partial.due_date ?? "",
    type: "follow_up",
    priority: "medium",
    context: "",
    status: partial.status ?? "pending",
    snoozed_until: "",
    source_touchpoint_id: partial.source_touchpoint_id ?? "",
    created_at: "",
    completed_at: "",
  } as ReminderRow;
}

describe("computeDebt — at_risk (client, 60+ days stale)", () => {
  it("flags a client with no touchpoint in 60+ days", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Cliff Client", type: "client", last_touch_date: isoDaysAgo(AT_RISK_THRESHOLD_DAYS + 5) })],
      [],
      [],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("at_risk");
    expect(out[0].daysSince).toBe(AT_RISK_THRESHOLD_DAYS + 5);
  });

  it("does NOT flag a client touched recently", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Fresh Client", type: "client", last_touch_date: isoDaysAgo(5) })],
      [],
      [],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("flags a client with no last_touch_date at all", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Never Touched", type: "client", last_touch_date: "" })],
      [],
      [],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("at_risk");
    expect(out[0].daysSince).toBeNull();
  });
});

describe("computeDebt — cooling (warm/hot, 30+ days stale)", () => {
  it("flags a warm prospect with 30+ days since touch", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Warm One", type: "prospect", relationship_stage: "warm", last_touch_date: isoDaysAgo(COOLING_THRESHOLD_DAYS + 1) })],
      [],
      [],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("cooling");
  });

  it("at_risk takes priority over cooling for a warm client", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Stale Warm Client", type: "client", relationship_stage: "warm", last_touch_date: isoDaysAgo(AT_RISK_THRESHOLD_DAYS + 5) })],
      [],
      [],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("at_risk");
  });

  it("cold contacts don't generate cooling debt (no expectation of regular contact)", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Cold One", type: "prospect", relationship_stage: "cold", last_touch_date: isoDaysAgo(90) })],
      [],
      [],
      TODAY
    );
    // No flag — cold contacts don't have momentum to lose. Stale_prospect
    // only checks the type=prospect bucket (which this contact qualifies for
    // but only if we WERE expecting touch — actually wait, the rule is type
    // === 'prospect' regardless of stage. Re-test.
    // Adjust: this should be flagged as stale_prospect because it's a
    // prospect type with no touch in 90 days.
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("stale_prospect");
  });
});

describe("computeDebt — stale_prospect (prospect, 14+ days stale)", () => {
  it("flags a prospect with no touch in 14+ days", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Forgotten Prospect", type: "prospect", relationship_stage: "cold", last_touch_date: isoDaysAgo(STALE_PROSPECT_THRESHOLD_DAYS + 1) })],
      [],
      [],
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("stale_prospect");
  });

  it("does NOT flag a prospect touched within 14 days", () => {
    const out = computeDebt(
      [contact({ id: "c1", name: "Active Prospect", type: "prospect", relationship_stage: "warm", last_touch_date: isoDaysAgo(5) })],
      [],
      [],
      TODAY
    );
    expect(out).toHaveLength(0);
  });
});

describe("computeDebt — unfollowed_action (touchpoint with no linked reminder)", () => {
  const c = contact({ id: "c1", name: "Hayden", type: "client", relationship_stage: "warm", last_touch_date: isoDaysAgo(2) });

  it("flags a touchpoint with action_items but no linked reminder, past grace period", () => {
    const tp = touchpoint({
      id: "tp1",
      contact_id: "c1",
      date: isoDaysAgo(UNFOLLOWED_ACTION_GRACE_DAYS + 2),
      action_items: "Send the SRS comparison sheet",
    });
    const out = computeDebt([c], [tp], [], TODAY);
    const unfollowed = out.filter((f) => f.category === "unfollowed_action");
    expect(unfollowed).toHaveLength(1);
    expect(unfollowed[0].touchpoint?.id).toBe("tp1");
  });

  it("does NOT flag when a reminder is linked to the touchpoint", () => {
    const tp = touchpoint({
      id: "tp1",
      contact_id: "c1",
      date: isoDaysAgo(UNFOLLOWED_ACTION_GRACE_DAYS + 2),
      action_items: "Send the SRS comparison sheet",
    });
    const r = reminder({ id: "r1", contact_id: "c1", source_touchpoint_id: "tp1", status: "pending" });
    const out = computeDebt([c], [tp], [r], TODAY);
    expect(out.filter((f) => f.category === "unfollowed_action")).toHaveLength(0);
  });

  it("does NOT flag a touchpoint within the grace period", () => {
    const tp = touchpoint({
      id: "tp1",
      contact_id: "c1",
      date: isoDaysAgo(UNFOLLOWED_ACTION_GRACE_DAYS - 1),
      action_items: "Send the SRS comparison sheet",
    });
    const out = computeDebt([c], [tp], [], TODAY);
    expect(out.filter((f) => f.category === "unfollowed_action")).toHaveLength(0);
  });

  it("does NOT flag a touchpoint with empty action_items", () => {
    const tp = touchpoint({
      id: "tp1",
      contact_id: "c1",
      date: isoDaysAgo(UNFOLLOWED_ACTION_GRACE_DAYS + 2),
      action_items: "   ",
    });
    const out = computeDebt([c], [tp], [], TODAY);
    expect(out.filter((f) => f.category === "unfollowed_action")).toHaveLength(0);
  });

  it("does NOT flag if the contact has been archived", () => {
    const archived = contact({
      id: "c2",
      name: "Archived Contact",
      type: "client",
      last_touch_date: isoDaysAgo(2),
      archived_at: "2026-05-01T10:00:00",
    });
    const tp = touchpoint({
      id: "tp2",
      contact_id: "c2",
      date: isoDaysAgo(UNFOLLOWED_ACTION_GRACE_DAYS + 5),
      action_items: "Follow up",
    });
    const out = computeDebt([archived], [tp], [], TODAY);
    expect(out).toHaveLength(0);
  });
});

describe("computeDebt — sorting and bucketing", () => {
  it("sorts by category priority (at_risk first), then days-since within category", () => {
    const flags = computeDebt(
      [
        contact({ id: "c1", name: "Mild Cooling", type: "prospect", relationship_stage: "warm", last_touch_date: isoDaysAgo(COOLING_THRESHOLD_DAYS + 5) }),
        contact({ id: "c2", name: "Bad Client", type: "client", last_touch_date: isoDaysAgo(AT_RISK_THRESHOLD_DAYS + 20) }),
        contact({ id: "c3", name: "Old Client", type: "client", last_touch_date: isoDaysAgo(AT_RISK_THRESHOLD_DAYS + 5) }),
      ],
      [],
      [],
      TODAY
    );
    expect(flags.map((f) => f.category)).toEqual([
      "at_risk",   // c2 — 80 days
      "at_risk",   // c3 — 65 days
      "cooling",   // c1
    ]);
    expect(flags[0].contact.id).toBe("c2"); // older at_risk first
  });

  it("bucketByCategory groups flags into the right buckets", () => {
    const flags = computeDebt(
      [
        contact({ id: "c1", name: "Cool", type: "prospect", relationship_stage: "warm", last_touch_date: isoDaysAgo(40) }),
        contact({ id: "c2", name: "Stale", type: "prospect", relationship_stage: "cold", last_touch_date: isoDaysAgo(20) }),
      ],
      [],
      [],
      TODAY
    );
    const buckets = bucketByCategory(flags);
    expect(buckets.cooling).toHaveLength(1);
    expect(buckets.stale_prospect).toHaveLength(1);
    expect(buckets.at_risk).toHaveLength(0);
    expect(buckets.unfollowed_action).toHaveLength(0);
  });
});

describe("computeDebt — archived contacts", () => {
  it("does not flag archived contacts in any category", () => {
    const archived = contact({
      id: "c1",
      name: "Archived",
      type: "client",
      last_touch_date: isoDaysAgo(180),
      archived_at: "2026-01-01T10:00:00",
    });
    const out = computeDebt([archived], [], [], TODAY);
    expect(out).toHaveLength(0);
  });
});
