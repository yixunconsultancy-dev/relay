import { useMemo } from "react";

import { useAllTouchpoints } from "@/lib/queries";
import {
  compute7DayHeatmap,
  computeDailyScore,
  heatmapAverage,
  heatmapMax,
} from "@/lib/score";
import { cn } from "@/lib/utils";

interface Props {
  today: string; // YYYY-MM-DD in the consultant's timezone
}

/**
 * Compact stat card for the Today header: today's activity score + 7-day
 * heatmap. Reads from the touchpoints table (the consultant's actual
 * activity), NOT the events table (which would credit data-entry days).
 *
 * Score = touchpoints whose `date` field falls on each day × 10, excluding
 * type='import' (those are bulk historical imports, not real activity).
 */
export function DailyScoreCard({ today }: Props) {
  const touchpoints = useAllTouchpoints();

  const heatmap = useMemo(() => {
    if (!touchpoints.data) return null;
    return compute7DayHeatmap(touchpoints.data, today);
  }, [touchpoints.data, today]);

  const todayScore = useMemo(() => {
    if (!touchpoints.data) return 0;
    return computeDailyScore(touchpoints.data, today);
  }, [touchpoints.data, today]);

  const avg = heatmap ? heatmapAverage(heatmap) : 0;
  const max = heatmap ? heatmapMax(heatmap) : 1;

  // Compact, fits in the header next to Quick Log.
  return (
    <div className="flex items-end gap-4 rounded-sm border border-border bg-bg-surface px-4 py-3">
      <div className="flex flex-col">
        <span className="awm-label">Today's score</span>
        <span className="font-display text-3xl font-light text-gold leading-none tabular-nums">
          {touchpoints.isPending ? "—" : todayScore}
        </span>
        <span className="mt-1 text-[10px] text-fg-subtle tabular-nums">
          7-day avg {avg}
        </span>
      </div>
      <div className="flex items-end gap-1" aria-label="7-day activity heatmap">
        {(heatmap ?? Array.from({ length: 7 }, () => null)).map((cell, i) => {
          const intensity = cell ? cell.score / max : 0;
          // Map 0..1 → opacity 0.08..1.0 so even zero days are faintly visible.
          const opacity = cell ? 0.08 + intensity * 0.92 : 0.08;
          return (
            <div
              key={cell?.date ?? `placeholder-${i}`}
              className={cn(
                "w-3.5 h-7 rounded-[2px]",
                cell?.isToday && "ring-1 ring-gold ring-offset-1 ring-offset-bg-surface"
              )}
              style={{ backgroundColor: `hsl(var(--gold) / ${opacity})` }}
              title={cell ? `${cell.date}: ${cell.score}` : "loading"}
            />
          );
        })}
      </div>
    </div>
  );
}
