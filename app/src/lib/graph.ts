// Build force-graph nodes + edges from contacts + relationships + referrals.
//
// Three kinds of nodes:
//   - contact: a row from the contacts table (the dominant kind)
//   - ghost:   a plain-text referral_source value that doesn't match any
//              contact (e.g. "ABC Immigration"). Clustered: every contact
//              that lists the same string gets connected to ONE shared
//              ghost node, surfacing aggregate referrers visually.
//
// Two kinds of edges:
//   - referral: contact → referrer (other contact, or ghost). One per
//               contact at most (referral_source is a single field).
//   - relationship: contact ↔ contact, typed by RelationshipKind.

import type { ContactRow, RelationshipRow } from "@/lib/schema";
import { parseReferralSource } from "@/components/referral-link-button";
import type { RelationshipKind } from "@/lib/enums";

export interface GraphNode {
  id: string;
  label: string;
  kind: "contact" | "ghost";
  // For contacts: the contact.type ('client'/'prospect'/etc.). Empty for ghosts.
  contactType: string;
  // Underlying contact (null for ghost nodes).
  contact?: ContactRow;
}

export interface GraphEdge {
  // Stable id, useful for React keys + force-graph internals.
  id: string;
  source: string;          // node.id
  target: string;          // node.id
  edgeKind: "referral" | RelationshipKind;
  // For relationship edges, the optional refinement label (e.g. "son").
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
  /** Stats for the header — useful in the UI without rescanning. */
  stats: {
    contactCount: number;
    ghostCount: number;
    referralEdgeCount: number;
    relationshipEdgeCount: number;
  };
}

/** Build a stable ghost-node ID from a referrer string. Lower-cased and
 *  whitespace-collapsed so "ABC  Immigration " and "abc immigration"
 *  cluster onto the same node. */
function ghostId(referrer: string): string {
  const norm = referrer.trim().toLowerCase().replace(/\s+/g, " ");
  return `ghost:${norm}`;
}

export function buildGraph(
  contacts: ContactRow[],
  relationships: RelationshipRow[]
): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphEdge[] = [];
  const contactIds = new Set<string>();
  const ghostNodes = new Map<string, GraphNode>(); // ghostId → node

  // Contact nodes (skip archived — they shouldn't pollute the graph).
  for (const c of contacts) {
    if (c.archived_at) continue;
    nodes.push({
      id: c.id,
      label: c.name,
      kind: "contact",
      contactType: c.type || "",
      contact: c,
    });
    contactIds.add(c.id);
  }

  // Referral edges + ghost nodes (derived from contact.referral_source).
  //
  // Direction: source = REFERRER (who sent them), target = the contact
  // they referred. The arrow reads "ABC Immigration → Demo Beatrice Wong"
  // ("ABC sent us this client"), which matches consultant intuition.
  let referralEdgeCount = 0;
  for (const c of contacts) {
    if (c.archived_at) continue;
    const parsed = parseReferralSource(c.referral_source);
    if (parsed.linkedContactId) {
      // Only emit if the linked contact actually exists in the active set.
      if (!contactIds.has(parsed.linkedContactId)) continue;
      links.push({
        id: `ref:${parsed.linkedContactId}->${c.id}`,
        source: parsed.linkedContactId,
        target: c.id,
        edgeKind: "referral",
      });
      referralEdgeCount += 1;
    } else if (parsed.plainText) {
      const gid = ghostId(parsed.plainText);
      if (!ghostNodes.has(gid)) {
        const ghost: GraphNode = {
          id: gid,
          // Display the FIRST-seen casing — preserves the original
          // capitalisation while clustering by normalised form.
          label: parsed.plainText,
          kind: "ghost",
          contactType: "",
        };
        ghostNodes.set(gid, ghost);
        nodes.push(ghost);
      }
      links.push({
        id: `ref:${gid}->${c.id}`,
        source: gid,
        target: c.id,
        edgeKind: "referral",
      });
      referralEdgeCount += 1;
    }
  }

  // Relationship edges (skip ones pointing at archived/deleted contacts).
  let relationshipEdgeCount = 0;
  for (const r of relationships) {
    if (!contactIds.has(r.from_contact_id)) continue;
    if (!contactIds.has(r.to_contact_id)) continue;
    links.push({
      id: `rel:${r.id}`,
      source: r.from_contact_id,
      target: r.to_contact_id,
      edgeKind: (r.kind || "family") as RelationshipKind,
      label: r.label || undefined,
    });
    relationshipEdgeCount += 1;
  }

  return {
    nodes,
    links,
    stats: {
      contactCount: nodes.filter((n) => n.kind === "contact").length,
      ghostCount: ghostNodes.size,
      referralEdgeCount,
      relationshipEdgeCount,
    },
  };
}
