import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ForceGraph2D from "react-force-graph-2d";
import { Network } from "lucide-react";

import {
  useAllRelationships,
  useContacts,
} from "@/lib/queries";
import { buildGraph, type GraphEdge, type GraphNode } from "@/lib/graph";

// Color resolver via CSS vars so light/dark schemes auto-apply.
function cssVar(name: string, alpha = 1): string {
  if (typeof window === "undefined") return "rgba(200,200,200,0.6)";
  const hsl = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!hsl) return "rgba(200,200,200,0.6)";
  return `hsl(${hsl} / ${alpha})`;
}

function nodeColor(node: GraphNode): string {
  // Full opacity — translucent fills let edge lines bleed through and
  // dirty up the look. Ghosts use this as their stroke color.
  if (node.kind === "ghost") {
    return cssVar("--fg-muted", 0.9);
  }
  switch (node.contactType) {
    case "client":
      return cssVar("--gold", 1);
    case "prospect":
      return cssVar("--status-success", 1);
    case "candidate":
      return cssVar("--status-warning", 1);
    case "advisor":
      return cssVar("--gold-bright", 1);
    default:
      return cssVar("--fg-muted", 0.95);
  }
}

// Distinct hues per edge kind. Hard-coded HSLA (not CSS vars) because the
// AWM palette only ships gold + clay-error + moss-success + neutrals, and
// edges need more separation than that gives us. All colors stay inside
// AWM-defensible territory (no cyan/violet/neon) but are deliberately more
// saturated and at higher opacity than the brand status tokens so they
// read clearly against both schemes' backgrounds.
function edgeColor(link: GraphEdge): string {
  switch (link.edgeKind) {
    case "referral":
      // Vivid gold — brand-signature color for "who sent who"
      return "hsla(41, 75%, 55%, 0.92)";
    case "spouse":
    case "parent":
    case "child":
      // Saturated clay — intimate / nuclear family
      return "hsla(7, 60%, 52%, 0.92)";
    case "sibling":
    case "family":
      // Moss green — extended family
      return "hsla(85, 30%, 45%, 0.9)";
    case "friend":
      // Deep cognac — social, distinct from gold
      return "hsla(20, 50%, 42%, 0.9)";
    case "business_partner":
      // Neutral slate — professional, lowest visual priority
      return "hsla(215, 12%, 50%, 0.88)";
    default:
      return "hsla(0, 0%, 50%, 0.7)";
  }
}

/** Referral edges are the most important — render them a touch thicker
 *  than the rest so they stand out from family/friend ties. */
function edgeWidth(link: GraphEdge): number {
  return link.edgeKind === "referral" ? 3 : 2.5;
}

export function GraphRoute() {
  const contacts = useContacts();
  const relationships = useAllRelationships();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Resize observer so the canvas tracks the available area when the
  // window resizes or the sidebar collapses.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!contacts.data || !relationships.data) {
      return { nodes: [], links: [], stats: { contactCount: 0, ghostCount: 0, referralEdgeCount: 0, relationshipEdgeCount: 0 } };
    }
    return buildGraph(contacts.data, relationships.data);
  }, [contacts.data, relationships.data]);

  const handleNodeClick = useCallback(
    (node: object) => {
      const n = node as GraphNode;
      if (n.kind === "contact") {
        navigate(`/contacts/${n.id}`);
      }
    },
    [navigate]
  );

  // Custom node render: filled circle for contacts (color by type), outlined
  // ring for ghosts. Label rendered just below the node, with size + opacity
  // scaling with zoom so labels are visible at overview AND readable
  // up close without exploding in size.
  const drawNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      // react-force-graph mutates the node objects with x/y/etc. so we cast
      // to a permissive shape rather than fight TypeScript.
      const n = node as GraphNode & { x?: number; y?: number };
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const radius = n.kind === "ghost" ? 4 : 6;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
      if (n.kind === "ghost") {
        // Mask any edge lines underneath the ghost so the outline reads
        // cleanly, then draw the outline on top.
        ctx.fillStyle = cssVar("--bg-base", 1);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = nodeColor(n);
        ctx.stroke();
      } else {
        ctx.fillStyle = nodeColor(n);
        ctx.fill();
      }

      // Labels: visible from zoom 0.5 upward. Font size is clamped so it
      // stays readable at any zoom level (the divide-by-globalScale trick
      // gives a constant on-screen size, but we cap min/max so very low
      // zoom doesn't produce 50px text or 1px text).
      if (globalScale >= 0.5) {
        const rawSize = 12 / globalScale;
        const fontSize = Math.max(2.5, Math.min(14, rawSize));
        // Fade in as zoom increases; near full opacity by 0.8.
        const opacity = Math.min(1, (globalScale - 0.4) * 3.5);
        ctx.font = `${fontSize}px Barlow, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = cssVar(
          n.kind === "ghost" ? "--fg-muted" : "--fg-primary",
          opacity
        );
        ctx.fillText(n.label, x, y + radius + 2);
      }
    },
    []
  );

  const totalNodes = graphData.stats.contactCount + graphData.stats.ghostCount;
  const totalEdges =
    graphData.stats.relationshipEdgeCount + graphData.stats.referralEdgeCount;
  const loading = contacts.isPending || relationships.isPending;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg-base/80 backdrop-blur px-8 py-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="awm-label flex items-center gap-1.5">
            <Network className="h-3 w-3" />
            Relationship graph
          </p>
          <h1 className="mt-1 font-display text-2xl font-light text-fg leading-none">
            {loading
              ? "Loading…"
              : `${totalNodes} nodes · ${totalEdges} links`}
          </h1>
          <p className="mt-2 text-xs text-fg-muted leading-snug max-w-xl">
            Contacts as nodes (color by type). Gold edges = referrals. Warm
            edges = family/spouse/parent/child. Plain-text referrers like
            "ABC Immigration" cluster into shared ghost nodes (outlined
            circles). Click a contact to open their detail page; scroll to
            zoom, drag to pan.
          </p>
        </div>
        <Legend />
      </header>
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted italic">
            Loading graph…
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted italic">
            No contacts to graph yet.
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData}
            width={size.width}
            height={size.height}
            backgroundColor={cssVar("--bg-base")}
            nodeId="id"
            nodeLabel={(n: object) => (n as GraphNode).label}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D) => {
              const n = node as GraphNode & { x?: number; y?: number };
              const radius = n.kind === "ghost" ? 6 : 8;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
            linkColor={(l: object) => edgeColor(l as GraphEdge)}
            linkWidth={(l: object) => edgeWidth(l as GraphEdge)}
            linkDirectionalArrowLength={(l: object) =>
              (l as GraphEdge).edgeKind === "referral" || (l as GraphEdge).edgeKind === "parent"
                ? 9
                : 0
            }
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            cooldownTicks={120}
          />
        )}
      </div>
    </div>
  );
}

/** Compact legend that floats in the header. Two stacked rows: nodes
 *  (filled or ringed circles) and edges (colored lines). */
function Legend() {
  const nodeItems: Array<{ label: string; tone: string; ringed?: boolean }> = [
    { label: "Client", tone: nodeColor({ kind: "contact", contactType: "client" } as GraphNode) },
    { label: "Prospect", tone: nodeColor({ kind: "contact", contactType: "prospect" } as GraphNode) },
    { label: "Other", tone: nodeColor({ kind: "contact", contactType: "other" } as GraphNode) },
    { label: "Ghost referrer", tone: nodeColor({ kind: "ghost", contactType: "" } as GraphNode), ringed: true },
  ];
  const edgeItems: Array<{ label: string; tone: string }> = [
    { label: "Referral", tone: edgeColor({ edgeKind: "referral" } as GraphEdge) },
    { label: "Spouse / parent / child", tone: edgeColor({ edgeKind: "spouse" } as GraphEdge) },
    { label: "Sibling / family", tone: edgeColor({ edgeKind: "sibling" } as GraphEdge) },
    { label: "Friend", tone: edgeColor({ edgeKind: "friend" } as GraphEdge) },
    { label: "Business partner", tone: edgeColor({ edgeKind: "business_partner" } as GraphEdge) },
  ];
  return (
    <div className="flex flex-col gap-1.5 text-[10px] text-fg-muted">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-condensed uppercase tracking-wider text-fg-subtle text-[9px] min-w-12">
          Nodes
        </span>
        {nodeItems.map((it) => (
          <span key={it.label} className="inline-flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full"
              style={
                it.ringed
                  ? { border: `1.5px solid ${it.tone}`, background: "transparent" }
                  : { background: it.tone }
              }
            />
            {it.label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-condensed uppercase tracking-wider text-fg-subtle text-[9px] min-w-12">
          Edges
        </span>
        {edgeItems.map((it) => (
          <span key={it.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-5 h-[2.5px] rounded-full"
              style={{ background: it.tone }}
            />
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}
