import { describe, it, expect } from "vitest";

import type { ContactRow } from "@/lib/schema";
import { upcomingBirthdays, UPCOMING_BIRTHDAY_WINDOW_DAYS } from "@/lib/birthdays";

const TODAY = new Date("2026-05-25T12:00:00");

function contact(
  partial: Partial<ContactRow> & { id: string; name: string }
): ContactRow {
  return {
    id: partial.id,
    name: partial.name,
    type: partial.type ?? "client",
    relationship_stage: "client",
    phone: "",
    email: "",
    occupation: "",
    company: "",
    birthday: partial.birthday ?? "",
    family: "",
    policies: "",
    financial_concerns: "",
    interests: "",
    referral_source: "",
    next_review_date: "",
    last_touch_date: "",
    notes: "",
    archived_at: partial.archived_at ?? "",
    created_at: "",
    updated_at: "",
  } as ContactRow;
}

describe("upcomingBirthdays — parsing", () => {
  it("parses ISO YYYY-MM-DD birthdays", () => {
    const c = contact({ id: "c1", name: "Iso Person", birthday: "1990-05-26" });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].daysUntil).toBe(1);
    expect(out[0].monthDay).toBe("05-26");
    expect(out[0].ageTurning).toBe(36);
  });

  it("parses UK-style DD/MM/YYYY birthdays", () => {
    const c = contact({ id: "c1", name: "Uk Person", birthday: "26/05/1990" });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].daysUntil).toBe(1);
    expect(out[0].ageTurning).toBe(36);
  });

  it("parses DD/MM/YY (two-digit year, defaults <30 → 2000s)", () => {
    const c = contact({ id: "c1", name: "Young", birthday: "26/05/15" });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].ageTurning).toBe(11);
  });

  it("returns null age when birthday has no year", () => {
    const c = contact({ id: "c1", name: "Yearless", birthday: "05-26" });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].ageTurning).toBeNull();
  });

  it("skips unparseable birthday strings (empty, garbage)", () => {
    const out = upcomingBirthdays(
      [
        contact({ id: "c1", name: "Empty", birthday: "" }),
        contact({ id: "c2", name: "Garbage", birthday: "next month" }),
        contact({ id: "c3", name: "Partial", birthday: "1990" }),
      ],
      TODAY
    );
    expect(out).toHaveLength(0);
  });

  it("rejects calendar-invalid dates (Feb 30)", () => {
    const c = contact({ id: "c1", name: "Bad date", birthday: "1990-02-30" });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(0);
  });
});

describe("upcomingBirthdays — window", () => {
  it("includes today's birthdays (daysUntil = 0)", () => {
    const c = contact({ id: "c1", name: "Today's BD", birthday: "1990-05-25" });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].daysUntil).toBe(0);
  });

  it("includes the boundary day (exactly N days out)", () => {
    // TODAY = 2026-05-25; window = 7; 2026-06-01 is exactly 7 days later.
    const c = contact({
      id: "c1",
      name: "Boundary",
      birthday: "1990-06-01",
    });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].daysUntil).toBe(UPCOMING_BIRTHDAY_WINDOW_DAYS);
  });

  it("excludes birthdays past the window", () => {
    const c = contact({ id: "c1", name: "Far out", birthday: "1990-08-01" });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(0);
  });

  it("rolls past birthdays into next year's occurrence (Jan birthday in May)", () => {
    const c = contact({ id: "c1", name: "Jan", birthday: "1990-01-15" });
    const out = upcomingBirthdays([c], TODAY, 365);
    expect(out).toHaveLength(1);
    // From 2026-05-25 to 2027-01-15 is roughly 235 days; just verify it's
    // positive and not "yesterday".
    expect(out[0].daysUntil).toBeGreaterThan(0);
    expect(out[0].daysUntil).toBeLessThan(365);
  });
});

describe("upcomingBirthdays — exclusions + sort", () => {
  it("excludes archived contacts", () => {
    const c = contact({
      id: "c1",
      name: "Archived",
      birthday: "1990-05-26",
      archived_at: "2026-01-01T10:00:00",
    });
    const out = upcomingBirthdays([c], TODAY);
    expect(out).toHaveLength(0);
  });

  it("sorts by daysUntil ascending (soonest first)", () => {
    const out = upcomingBirthdays(
      [
        contact({ id: "c1", name: "In 5", birthday: "1990-05-30" }),
        contact({ id: "c2", name: "Today", birthday: "1990-05-25" }),
        contact({ id: "c3", name: "In 2", birthday: "1990-05-27" }),
      ],
      TODAY
    );
    expect(out.map((b) => b.contact.name)).toEqual(["Today", "In 2", "In 5"]);
  });
});

