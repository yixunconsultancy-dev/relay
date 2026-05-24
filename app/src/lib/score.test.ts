import { describe, it, expect } from "vitest";

import type { EventRow } from "@/lib/schema";
import {
  EVENT_WEIGHTS,
  eventDate,
  computeDailyScore,
  compute7DayHeatmap,
  heatmapMax,
  heatmapAverage,
} from "@/lib/score";

function evt(
  partial: Partial<EventRow> & { kind: string; timestamp: string }
): EventRow {
  return {
    rowid: 1,
    id: "e_x",
    timestamp: partial.timestamp,
    kind: partial.kind,
    contact_id: partial.contact_id ?? "c_1",
    subject_id: partial.subject_id ?? "",
    payload: partial.payload ?? "{}",
    source: partial.source ?? "log-touchpoint",
  } as EventRow;
}

describe("eventDate", () => {
  it("slices the YYYY-MM-DD off an ISO timestamp", () => {
    expect(eventDate("2026-05-24T10:00:00")).toBe("2026-05-24");
    expect(eventDate("2026-05-24T23:59:59")).toBe("2026-05-24");
  });
});

describe("computeDailyScore", () => {
  it("returns 0 for a date with no events", () => {
    const events = [evt({ kind: "touchpoint_logged", timestamp: "2026-05-22T10:00:00" })];
    expect(computeDailyScore(events, "2026-05-24")).toBe(0);
  });

  it("sums weights for events on the given date", () => {
    const events = [
      evt({ kind: "touchpoint_logged", timestamp: "2026-05-24T09:00:00" }), // 10
      evt({ kind: "contact_created", timestamp: "2026-05-24T10:00:00" }),   // 15
      evt({ kind: "reminder_completed", timestamp: "2026-05-24T11:00:00" }), // 5
      evt({ kind: "touchpoint_logged", timestamp: "2026-05-23T09:00:00" }), // wrong day, ignored
    ];
    expect(computeDailyScore(events, "2026-05-24")).toBe(30);
  });

  it("zero-weight events do not contribute (reminder_snoozed/cancelled/duplicate_skipped)", () => {
    const events = [
      evt({ kind: "reminder_snoozed", timestamp: "2026-05-24T10:00:00" }),
      evt({ kind: "reminder_cancelled", timestamp: "2026-05-24T11:00:00" }),
      evt({ kind: "reminder_duplicate_skipped", timestamp: "2026-05-24T12:00:00" }),
    ];
    expect(computeDailyScore(events, "2026-05-24")).toBe(0);
  });

  it("unknown event kinds use the default weight (1) — graceful degradation", () => {
    // Cast through unknown so the test can simulate a kind that doesn't exist
    // in the EventKind union yet — the runtime function must handle it.
    const events = [
      evt({
        kind: "future_kind_added_after_score_ts" as unknown as EventRow["kind"],
        timestamp: "2026-05-24T09:00:00",
      }),
    ];
    expect(computeDailyScore(events, "2026-05-24")).toBe(1);
  });
});

describe("compute7DayHeatmap", () => {
  it("returns 7 cells, oldest first, ending on today", () => {
    const cells = compute7DayHeatmap([], "2026-05-24");
    expect(cells).toHaveLength(7);
    expect(cells[0].date).toBe("2026-05-18");
    expect(cells[6].date).toBe("2026-05-24");
    expect(cells[6].isToday).toBe(true);
    expect(cells[5].isToday).toBe(false);
  });

  it("scores per-day correctly across the window", () => {
    const events = [
      // Today: touchpoint(10) + contact_created(15) = 25
      evt({ kind: "touchpoint_logged", timestamp: "2026-05-24T09:00:00" }),
      evt({ kind: "contact_created", timestamp: "2026-05-24T10:00:00" }),
      // 3 days ago: reminder_completed(5)
      evt({ kind: "reminder_completed", timestamp: "2026-05-21T14:00:00" }),
      // 8 days ago: outside the 7-day window, should be ignored
      evt({ kind: "touchpoint_logged", timestamp: "2026-05-16T09:00:00" }),
    ];
    const cells = compute7DayHeatmap(events, "2026-05-24");
    expect(cells[6].score).toBe(25); // today
    expect(cells[3].score).toBe(5);  // 3 days ago (2026-05-21)
    // All other cells are zero
    expect(cells[0].score).toBe(0);
    expect(cells[1].score).toBe(0);
    expect(cells[2].score).toBe(0);
    expect(cells[4].score).toBe(0);
    expect(cells[5].score).toBe(0);
  });

  it("handles month boundaries correctly", () => {
    const cells = compute7DayHeatmap([], "2026-06-02");
    expect(cells[0].date).toBe("2026-05-27");
    expect(cells[6].date).toBe("2026-06-02");
  });
});

describe("heatmapMax / heatmapAverage", () => {
  it("max returns the highest cell score", () => {
    const cells = compute7DayHeatmap(
      [
        evt({ kind: "contact_created", timestamp: "2026-05-23T09:00:00" }), // 15
        evt({ kind: "touchpoint_logged", timestamp: "2026-05-24T09:00:00" }), // 10
      ],
      "2026-05-24"
    );
    expect(heatmapMax(cells)).toBe(15);
  });

  it("max returns 1 when all cells are zero (avoids divide-by-zero in UI normalization)", () => {
    const cells = compute7DayHeatmap([], "2026-05-24");
    expect(heatmapMax(cells)).toBe(1);
  });

  it("average rounds to the nearest integer", () => {
    const cells = compute7DayHeatmap(
      [
        // 10 on day 0, 15 on day 6 = (10+15)/7 = 3.57 → 4
        evt({ kind: "touchpoint_logged", timestamp: "2026-05-18T09:00:00" }),
        evt({ kind: "contact_created", timestamp: "2026-05-24T09:00:00" }),
      ],
      "2026-05-24"
    );
    expect(heatmapAverage(cells)).toBe(4);
  });
});

describe("EVENT_WEIGHTS sanity", () => {
  it("includes all kinds we currently emit + zeros out the non-progress ones", () => {
    expect(EVENT_WEIGHTS.touchpoint_logged).toBeGreaterThan(0);
    expect(EVENT_WEIGHTS.contact_created).toBeGreaterThan(EVENT_WEIGHTS.contact_updated);
    expect(EVENT_WEIGHTS.reminder_snoozed).toBe(0);
    expect(EVENT_WEIGHTS.reminder_cancelled).toBe(0);
  });
});
