import { describe, it, expect } from "vitest";

import type { TouchpointRow } from "@/lib/schema";
import {
  TOUCHPOINT_WEIGHT,
  computeDailyScore,
  compute7DayHeatmap,
  heatmapMax,
  heatmapAverage,
} from "@/lib/score";

function tp(
  partial: Partial<TouchpointRow> & { id: string; date: string }
): TouchpointRow {
  return {
    id: partial.id,
    contact_id: partial.contact_id ?? "c1",
    contact_name: partial.contact_name ?? "Demo",
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

describe("computeDailyScore", () => {
  it("returns 0 for a date with no touchpoints", () => {
    const ts = [tp({ id: "t1", date: "2026-05-22" })];
    expect(computeDailyScore(ts, "2026-05-24")).toBe(0);
  });

  it("counts touchpoints on the given date × TOUCHPOINT_WEIGHT", () => {
    const ts = [
      tp({ id: "t1", date: "2026-05-24" }),
      tp({ id: "t2", date: "2026-05-24" }),
      tp({ id: "t3", date: "2026-05-24" }),
      tp({ id: "t4", date: "2026-05-23" }), // different day, ignored
    ];
    expect(computeDailyScore(ts, "2026-05-24")).toBe(3 * TOUCHPOINT_WEIGHT);
  });

  it("uses touchpoint.date (activity), not created_at (logged)", () => {
    // A touchpoint dated 5 days ago but logged today still counts for the
    // dated day, not today. This is the whole point of the new model.
    const ts = [
      tp({ id: "t1", date: "2026-05-19", created_at: "2026-05-24T10:00:00" }),
    ];
    expect(computeDailyScore(ts, "2026-05-19")).toBe(TOUCHPOINT_WEIGHT);
    expect(computeDailyScore(ts, "2026-05-24")).toBe(0);
  });

  it("excludes type='import' touchpoints (bulk historical, not real activity)", () => {
    const ts = [
      tp({ id: "t1", date: "2026-05-24", type: "meeting" }),
      tp({ id: "t2", date: "2026-05-24", type: "import" }),
      tp({ id: "t3", date: "2026-05-24", type: "import" }),
    ];
    expect(computeDailyScore(ts, "2026-05-24")).toBe(1 * TOUCHPOINT_WEIGHT);
  });

  it("treats all non-import touchpoint types as equal-weight activity", () => {
    const ts = [
      tp({ id: "t1", date: "2026-05-24", type: "meeting" }),
      tp({ id: "t2", date: "2026-05-24", type: "call" }),
      tp({ id: "t3", date: "2026-05-24", type: "coffee" }),
      tp({ id: "t4", date: "2026-05-24", type: "message" }),
      tp({ id: "t5", date: "2026-05-24", type: "lunch" }),
    ];
    expect(computeDailyScore(ts, "2026-05-24")).toBe(5 * TOUCHPOINT_WEIGHT);
  });
});

describe("compute7DayHeatmap", () => {
  it("returns 7 cells, oldest first, ending on today, with count + score per cell", () => {
    const cells = compute7DayHeatmap([], "2026-05-24");
    expect(cells).toHaveLength(7);
    expect(cells[0].date).toBe("2026-05-18");
    expect(cells[6].date).toBe("2026-05-24");
    expect(cells[6].isToday).toBe(true);
    expect(cells[5].isToday).toBe(false);
    // Empty input → all zero
    for (const c of cells) {
      expect(c.count).toBe(0);
      expect(c.score).toBe(0);
    }
  });

  it("scores per-day across the window using touchpoint dates", () => {
    const ts = [
      // Today: 2 touchpoints = 20
      tp({ id: "t1", date: "2026-05-24" }),
      tp({ id: "t2", date: "2026-05-24" }),
      // 3 days ago (2026-05-21): 1 touchpoint = 10
      tp({ id: "t3", date: "2026-05-21" }),
      // 8 days ago: outside window, ignored
      tp({ id: "t4", date: "2026-05-16" }),
    ];
    const cells = compute7DayHeatmap(ts, "2026-05-24");
    expect(cells[6].count).toBe(2);
    expect(cells[6].score).toBe(20);
    expect(cells[3].count).toBe(1);
    expect(cells[3].score).toBe(10);
    // Other days zero
    expect(cells[0].score).toBe(0);
    expect(cells[5].score).toBe(0);
  });

  it("handles month boundaries correctly", () => {
    const cells = compute7DayHeatmap([], "2026-06-02");
    expect(cells[0].date).toBe("2026-05-27");
    expect(cells[6].date).toBe("2026-06-02");
  });

  it("excludes import touchpoints from heatmap cells too", () => {
    const ts = [
      tp({ id: "t1", date: "2026-05-24", type: "meeting" }),
      tp({ id: "t2", date: "2026-05-24", type: "import" }),
    ];
    const cells = compute7DayHeatmap(ts, "2026-05-24");
    expect(cells[6].count).toBe(1);
    expect(cells[6].score).toBe(10);
  });
});

describe("heatmapMax / heatmapAverage", () => {
  it("max returns the highest cell score", () => {
    const cells = compute7DayHeatmap(
      [
        tp({ id: "t1", date: "2026-05-23" }),
        tp({ id: "t2", date: "2026-05-23" }),
        tp({ id: "t3", date: "2026-05-23" }), // 30 on 2026-05-23
        tp({ id: "t4", date: "2026-05-24" }), // 10 today
      ],
      "2026-05-24"
    );
    expect(heatmapMax(cells)).toBe(30);
  });

  it("max returns 1 when all cells are zero (avoids divide-by-zero in UI)", () => {
    const cells = compute7DayHeatmap([], "2026-05-24");
    expect(heatmapMax(cells)).toBe(1);
  });

  it("average rounds to the nearest integer", () => {
    const cells = compute7DayHeatmap(
      [
        // 10 + 20 = 30 over 7 days = 4.28 → 4
        tp({ id: "t1", date: "2026-05-18" }),
        tp({ id: "t2", date: "2026-05-24" }),
        tp({ id: "t3", date: "2026-05-24" }),
      ],
      "2026-05-24"
    );
    expect(heatmapAverage(cells)).toBe(4);
  });
});
