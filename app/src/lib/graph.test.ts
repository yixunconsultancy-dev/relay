import { describe, it, expect, vi } from "vitest";

// graph.ts indirectly imports queries.ts (via referral-link-button.tsx ←
// parseReferralSource). Stub the Tauri-side imports so the test runs in
// node — same pattern as polling.test.ts.
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(), resetDbConnection: vi.fn() }));

import type { ContactRow, RelationshipRow } from "@/lib/schema";
import { buildGraph } from "@/lib/graph";

function contact(
  partial: Partial<ContactRow> & { id: string; name: string }
): ContactRow {
  return {
    id: partial.id,
    name: partial.name,
    type: partial.type ?? "prospect",
    relationship_stage: "warm",
    phone: "",
    email: "",
    occupation: "",
    company: "",
    address: "",
    birthday: "",
    family: "",
    policies: "",
    financial_concerns: "",
    interests: "",
    referral_source: partial.referral_source ?? "",
    next_review_date: "",
    last_touch_date: "",
    notes: "",
    archived_at: partial.archived_at ?? "",
    created_at: "",
    updated_at: "",
  } as ContactRow;
}

function rel(
  partial: Partial<RelationshipRow> & { id: string; from_contact_id: string; to_contact_id: string }
): RelationshipRow {
  return {
    id: partial.id,
    from_contact_id: partial.from_contact_id,
    to_contact_id: partial.to_contact_id,
    kind: partial.kind ?? "family",
    label: partial.label ?? "",
    notes: "",
    created_at: "",
  } as RelationshipRow;
}

describe("buildGraph — contact nodes", () => {
  it("emits one node per non-archived contact", () => {
    const g = buildGraph(
      [
        contact({ id: "c1", name: "Alice" }),
        contact({ id: "c2", name: "Bob" }),
        contact({ id: "c3", name: "Archived", archived_at: "2026-01-01T00:00:00" }),
      ],
      []
    );
    expect(g.nodes.filter((n) => n.kind === "contact").map((n) => n.id).sort()).toEqual(["c1", "c2"]);
    expect(g.stats.contactCount).toBe(2);
  });
});

describe("buildGraph — relationship edges", () => {
  it("emits an edge per relationship, typed by kind", () => {
    const g = buildGraph(
      [contact({ id: "c1", name: "A" }), contact({ id: "c2", name: "B" })],
      [
        rel({ id: "r1", from_contact_id: "c1", to_contact_id: "c2", kind: "spouse" }),
        rel({ id: "r2", from_contact_id: "c1", to_contact_id: "c2", kind: "business_partner" }),
      ]
    );
    expect(g.links.filter((l) => l.edgeKind === "spouse")).toHaveLength(1);
    expect(g.links.filter((l) => l.edgeKind === "business_partner")).toHaveLength(1);
    expect(g.stats.relationshipEdgeCount).toBe(2);
  });

  it("drops relationship edges pointing at unknown / archived contacts", () => {
    const g = buildGraph(
      [contact({ id: "c1", name: "A" })],
      [rel({ id: "r1", from_contact_id: "c1", to_contact_id: "c_missing", kind: "spouse" })]
    );
    expect(g.links).toHaveLength(0);
    expect(g.stats.relationshipEdgeCount).toBe(0);
  });
});

describe("buildGraph — referral edges (linked)", () => {
  it("links a contact to its @c_xxx referrer if that contact exists", () => {
    // Use realistic kit-shaped IDs (c_YYYYMMDD_xxxx) — parseReferralSource's
    // regex requires the c_ prefix.
    const g = buildGraph(
      [
        contact({ id: "c_20260525_aaaa", name: "Referrer" }),
        contact({ id: "c_20260525_bbbb", name: "Referee", referral_source: "@c_20260525_aaaa" }),
      ],
      []
    );
    const refs = g.links.filter((l) => l.edgeKind === "referral");
    expect(refs).toHaveLength(1);
    expect(refs[0].source).toBe("c_20260525_bbbb");
    expect(refs[0].target).toBe("c_20260525_aaaa");
    expect(g.stats.ghostCount).toBe(0);
  });

  it("drops referral edge if the referenced contact ID doesn't exist", () => {
    const g = buildGraph(
      [contact({ id: "c_20260525_lonely", name: "Lonely", referral_source: "@c_20260525_missing" })],
      []
    );
    expect(g.links).toHaveLength(0);
  });
});

describe("buildGraph — ghost nodes (plain-text referrers)", () => {
  it("creates one ghost node per unique normalised referrer string", () => {
    const g = buildGraph(
      [
        contact({ id: "c1", name: "Client1", referral_source: "ABC Immigration" }),
        contact({ id: "c2", name: "Client2", referral_source: "ABC  Immigration " }),
        contact({ id: "c3", name: "Client3", referral_source: "abc immigration" }),
        contact({ id: "c4", name: "Client4", referral_source: "XYZ Bank" }),
      ],
      []
    );
    const ghosts = g.nodes.filter((n) => n.kind === "ghost");
    expect(ghosts).toHaveLength(2);
    expect(g.stats.ghostCount).toBe(2);
    // 4 referral edges (one per contact)
    expect(g.links.filter((l) => l.edgeKind === "referral")).toHaveLength(4);
  });

  it("ghost node display label preserves first-seen casing", () => {
    const g = buildGraph(
      [
        contact({ id: "c1", name: "First", referral_source: "ABC Immigration" }),
        contact({ id: "c2", name: "Second", referral_source: "abc immigration" }),
      ],
      []
    );
    const ghosts = g.nodes.filter((n) => n.kind === "ghost");
    expect(ghosts[0].label).toBe("ABC Immigration");
  });

  it("does not create ghost nodes from archived contacts' referral_source", () => {
    const g = buildGraph(
      [
        contact({
          id: "c1", name: "Archived", referral_source: "Hidden Source",
          archived_at: "2026-01-01T00:00:00",
        }),
      ],
      []
    );
    expect(g.nodes).toHaveLength(0);
    expect(g.stats.ghostCount).toBe(0);
  });
});

describe("buildGraph — mixed scenario", () => {
  it("aggregate stats are accurate", () => {
    const A = "c_20260525_a000";
    const B = "c_20260525_b000";
    const C = "c_20260525_c000";
    const D = "c_20260525_d000";
    const g = buildGraph(
      [
        contact({ id: A, name: "A", referral_source: `@${B}` }),  // linked ref
        contact({ id: B, name: "B", referral_source: "Big Co" }),  // ghost ref
        contact({ id: C, name: "C", referral_source: "Big Co" }),  // same ghost
        contact({ id: D, name: "D" }),                              // no ref
      ],
      [
        rel({ id: "r1", from_contact_id: A, to_contact_id: B, kind: "spouse" }),
        rel({ id: "r2", from_contact_id: D, to_contact_id: A, kind: "sibling" }),
      ]
    );
    expect(g.stats.contactCount).toBe(4);
    expect(g.stats.ghostCount).toBe(1);
    expect(g.stats.referralEdgeCount).toBe(3); // A→B + B→ghost + C→ghost
    expect(g.stats.relationshipEdgeCount).toBe(2);
    expect(g.nodes).toHaveLength(5); // 4 contacts + 1 ghost
    expect(g.links).toHaveLength(5);
  });
});
