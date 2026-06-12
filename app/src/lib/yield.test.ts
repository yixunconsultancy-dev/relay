import { describe, it, expect } from "vitest";
import { computeAnnualisedYield } from "./yield";

describe("computeAnnualisedYield", () => {
  it("monthly DCA, ~12.5% annual over 2 years", () => {
    const r = computeAnnualisedYield({
      startDate: "2024-01-15",
      premiumAmount: 500,
      premiumFrequency: "Monthly",
      totalPremiumsPaid: 12000,
      currentValue: 13500,
      asOf: "2026-01-15",
      premiumHolidayMonths: 0,
    });
    expect(r.annualisedPct).not.toBeNull();
    expect(r.annualisedPct!).toBeGreaterThan(10);
    expect(r.annualisedPct!).toBeLessThan(16);
  });

  it("single-pay grows 33% over 3 years → ~11% simple annual", () => {
    const r = computeAnnualisedYield({
      startDate: "2023-01-01",
      premiumAmount: 10000,
      premiumFrequency: "Single-Pay",
      totalPremiumsPaid: 10000,
      currentValue: 13310,
      asOf: "2026-01-01",
      premiumHolidayMonths: 0,
    });
    expect(r.annualisedPct).not.toBeNull();
    expect(r.annualisedPct!).toBeGreaterThan(10);
    expect(r.annualisedPct!).toBeLessThan(12);
  });

  it("period too short → null with reason", () => {
    const r = computeAnnualisedYield({
      startDate: "2026-05-01",
      premiumAmount: 500,
      premiumFrequency: "Monthly",
      totalPremiumsPaid: 500,
      currentValue: 510,
      asOf: "2026-05-26",
      premiumHolidayMonths: 0,
    });
    expect(r.annualisedPct).toBeNull();
    expect(r.reason).toContain("too short");
  });

  it("holiday months reduce expected schedule, still computes", () => {
    const r = computeAnnualisedYield({
      startDate: "2024-01-15",
      premiumAmount: 500,
      premiumFrequency: "Monthly",
      totalPremiumsPaid: 10500,  // 21 months
      currentValue: 11800,
      asOf: "2026-01-15",
      premiumHolidayMonths: 3,
    });
    expect(r.annualisedPct).not.toBeNull();
    expect(r.annualisedPct!).toBeGreaterThan(5);
  });

  it("missing inputs return null with reason", () => {
    const r = computeAnnualisedYield({
      startDate: "",
      premiumAmount: 500,
      premiumFrequency: "Monthly",
      totalPremiumsPaid: 0,
      currentValue: 0,
      asOf: "2026-01-15",
      premiumHolidayMonths: 0,
    });
    expect(r.annualisedPct).toBeNull();
    expect(r.reason).toBeTruthy();
  });
});
