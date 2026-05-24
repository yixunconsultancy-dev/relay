import { useMemo } from "react";

import { useAllTouchpoints } from "@/lib/queries";
import {
  compute7DayHeatmap,
  heatmapAverage,
  type HeatmapCell,
} from "@/lib/score";
import { cn } from "@/lib/utils";

interface Props {
  today: string; // YYYY-MM-DD in the consultant's timezone
}

// Each bucket has 20 PNGs in app/public/garden/<bucket>/batch<N>_<bucket>_NN.png
// Score thresholds match the prompts the assets were generated with.
const BUCKETS = [
  { key: "sparse", batch: 1, maxScore: 14, count: 20 },
  { key: "light", batch: 2, maxScore: 30, count: 20 },
  { key: "medium", batch: 3, maxScore: 50, count: 20 },
  { key: "busy", batch: 4, maxScore: 75, count: 20 },
  { key: "dense", batch: 5, maxScore: Infinity, count: 20 },
] as const;

function bucketForScore(score: number): typeof BUCKETS[number] | null {
  if (score <= 0) return null;
  for (const b of BUCKETS) {
    if (score <= b.maxScore) return b;
  }
  return BUCKETS[BUCKETS.length - 1];
}

/** Hash a string to a non-negative integer. Used to deterministically pick a
 *  PNG variant per date so a given day always shows the same flowerbed
 *  across renders. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function imageForCell(cell: HeatmapCell): string | null {
  const bucket = bucketForScore(cell.score);
  if (!bucket) return null;
  const idx = (hashString(cell.date) % bucket.count) + 1;
  const num = idx.toString().padStart(2, "0");
  return `/garden/${bucket.key}/batch${bucket.batch}_${bucket.key}_${num}.png`;
}

/**
 * Full-width activity garden — replaces the 7-day heatmap with 14 days
 * of AI-generated linework flowerbed PNGs, picked per day's score
 * bucket. Today's column is marked with a gold ground tick.
 *
 * Dark scheme uses CSS `filter: invert(1)` so the same 100 PNGs serve
 * both schemes — black ink on cream becomes white ink on near-black.
 */
export function GardenCard({ today }: Props) {
  const touchpoints = useAllTouchpoints();
  const cells = useMemo(() => {
    if (!touchpoints.data) return [];
    return compute7DayHeatmap(touchpoints.data, today, 14);
  }, [touchpoints.data, today]);

  const todayCell = cells.find((c) => c.isToday);
  const todayScore = todayCell?.score ?? 0;
  const todayCount = todayCell?.count ?? 0;
  const avg = useMemo(() => (cells.length ? heatmapAverage(cells) : 0), [cells]);

  return (
    <section className="rounded-sm border border-border bg-bg-surface px-6 py-5">
      <header className="flex items-end justify-between gap-6 mb-4 flex-wrap">
        <div>
          <h2 className="awm-label">Activity garden · last 14 days</h2>
          <p className="text-xs text-fg-muted mt-1">
            Each column is a day. Density of the flowerbed scales with
            touchpoints logged that day. Today's the rightmost column.
          </p>
        </div>
        <div className="flex items-end gap-6">
          <div className="flex flex-col items-end">
            <span className="awm-label">Today</span>
            <span className="font-display text-3xl font-light text-gold leading-none tabular-nums">
              {touchpoints.isPending ? "—" : todayScore}
            </span>
            <span className="text-[10px] text-fg-subtle tabular-nums mt-1">
              {touchpoints.isPending ? "" : `${todayCount} touchpoint${todayCount === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="awm-label">14d avg</span>
            <span className="font-display text-3xl font-light text-fg-muted leading-none tabular-nums">
              {touchpoints.isPending ? "—" : avg}
            </span>
            <span className="text-[10px] text-fg-subtle mt-1">per day</span>
          </div>
        </div>
      </header>
      <div className="relative w-full">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${cells.length || 14}, 1fr)` }}
        >
          {(cells.length ? cells : Array.from({ length: 14 }, () => null)).map(
            (cell, i) => (
              <GardenCell key={cell?.date ?? `loading-${i}`} cell={cell} />
            )
          )}
        </div>
      </div>
    </section>
  );
}

function GardenCell({ cell }: { cell: HeatmapCell | null }) {
  const imgSrc = cell ? imageForCell(cell) : null;
  const isToday = cell?.isToday ?? false;
  const tooltip = cell
    ? `${cell.date}: ${cell.count} touchpoint${cell.count === 1 ? "" : "s"} · score ${cell.score}`
    : "loading";
  return (
    <div
      className="relative flex flex-col items-stretch"
      title={tooltip}
      aria-label={tooltip}
    >
      {/* Cell sized to the flower portion of the PNG, not the full source.
          PNGs are 600×900 with flowers in roughly the bottom 35%. We crop
          via overflow-hidden + transform-scale anchored at bottom: the
          flowers zoom up to fill the cell, the empty "sky" portion gets
          pushed above the visible area. Tradeoff is some horizontal
          cropping on wide dense beds, but the center of every bed
          remains visible. */}
      <div className="h-28 overflow-hidden flex items-end justify-center">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className={cn(
              "block w-full h-auto origin-bottom scale-[2.4] select-none",
              "dark-invert"
            )}
            draggable={false}
          />
        ) : (
          // Empty day — no bed at all, just the ground tick below.
          <div className="h-px w-px" />
        )}
      </div>
      {/* Per-day ground tick. Today's tick is gold + thicker + wider. */}
      <div
        className={cn(
          "mx-auto mt-1.5 rounded-full",
          isToday ? "h-[2.5px] w-14 bg-gold" : "h-px w-9 bg-fg/30"
        )}
      />
    </div>
  );
}
