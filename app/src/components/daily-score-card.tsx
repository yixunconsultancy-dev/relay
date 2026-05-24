import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchActivityEvents } from "@/lib/queries";
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

/** Local-date YYYY-MM-DD minus N days. Mirrors the pure helper in lib/score. */
function isoDaysAgo(today: string, days: number): string {
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() - days);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Compact stat card for the Today header: today's activity score + 7-day
 * heatmap. Reads from the events table directly via fetchActivityEvents.
 *
 * Score weights live in lib/score.ts. The card auto-refreshes via the events
 * polling loop (queryKey shape matches what dispatchInvalidations refreshes
 * when relevant kinds arrive).
 */
export function DailyScoreCard({ today }: Props) {
  // Pull 7-days-back of events, generous LIMIT so even a heavy day fits.
  const since = isoDaysAgo(today, 6); // inclusive of today = 7 days total
  const events = useQuery({
    queryKey: ["score", "events-since", since],
    queryFn: () => fetchActivityEvents({ since, limit: 1000 }),
  });

  const heatmap = useMemo(() => {
    if (!events.data) return null;
    return compute7DayHeatmap(events.data, today);
  }, [events.data, today]);

  const todayScore = useMemo(() => {
    if (!events.data) return 0;
    return computeDailyScore(events.data, today);
  }, [events.data, today]);

  const avg = heatmap ? heatmapAverage(heatmap) : 0;
  const max = heatmap ? heatmapMax(heatmap) : 1;

  // Compact, fits in the header next to Quick Log.
  return (
    <div className="flex items-end gap-4 rounded-sm border border-border bg-bg-surface px-4 py-3">
      <div className="flex flex-col">
        <span className="awm-label">Today's score</span>
        <span className="font-display text-3xl font-light text-gold leading-none tabular-nums">
          {events.isPending ? "—" : todayScore}
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
