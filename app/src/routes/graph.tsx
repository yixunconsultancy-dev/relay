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
  if (node.kind === "ghost") {
    return cssVar("--fg-muted", 0.5);
  }
  switch (node.contactType) {
    case "client":
      return cssVar("--gold", 0.9);
    case "prospect":
      return cssVar("--status-success", 0.85);
    case "candidate":
      return cssVar("--status-warning", 0.8);
    case "advisor":
      return cssVar("--gold-bright", 0.9);
    default:
      return cssVar("--fg-muted", 0.7);
  }
}

function edgeColor(link: GraphEdge): string {
  switch (link.edgeKind) {
    case "referral":
      return cssVar("--gold", 0.55);
    case "spouse":
    case "parent":
    case "child":
      return cssVar("--status-error", 0.55); // clay tone in light/dark scheme
    case "sibling":
    case "family":
      return cssVar("--status-warning", 0.5);
    case "friend":
      return cssVar("--gold-bright", 0.4);
    case "business_partner":
      return cssVar("--fg-muted", 0.45);
    default:
      return cssVar("--fg-muted", 0.4);
  }
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
  // ring for ghosts. Label rendered just below the node when the zoom level
  // is far enough in that text would be readable.
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
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = nodeColor(n);
        ctx.stroke();
      } else {
        ctx.fillStyle = nodeColor(n);
        ctx.fill();
      }

      // Label appears once you zoom in enough; otherwise text is unreadable
      // and just adds noise.
      if (globalScale >= 1.5) {
        const fontSize = 11 / globalScale;
        ctx.font = `${fontSize}px Barlow, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = cssVar(n.kind === "ghost" ? "--fg-subtle" : "--fg", 0.85);
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
            linkWidth={1.2}
            linkDirectionalArrowLength={(l: object) =>
              (l as GraphEdge).edgeKind === "referral" || (l as GraphEdge).edgeKind === "parent"
                ? 3
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

/** Compact legend that floats in the header. */
function Legend() {
  const items: Array<{ label: string; tone: string; ringed?: boolean }> = [
    { label: "Client", tone: nodeColor({ kind: "contact", contactType: "client" } as GraphNode) },
    { label: "Prospect", tone: nodeColor({ kind: "contact", contactType: "prospect" } as GraphNode) },
    { label: "Other", tone: nodeColor({ kind: "contact", contactType: "other" } as GraphNode) },
    { label: "Ghost referrer", tone: nodeColor({ kind: "ghost", contactType: "" } as GraphNode), ringed: true },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap text-[10px] text-fg-muted">
      {items.map((it) => (
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
  );
}
