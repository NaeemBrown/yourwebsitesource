import { describe, it, expect } from "vitest";
import {
  intervalMonths,
  addMonthsClamped,
  nextChargeAfter,
} from "../../server/utils/billing-cycle";

describe("intervalMonths", () => {
  it("maps month → 1 and year → 12", () => {
    expect(intervalMonths("month")).toBe(1);
    expect(intervalMonths("year")).toBe(12);
  });
});

describe("addMonthsClamped", () => {
  it("adds whole months", () => {
    const d = addMonthsClamped(new Date(2026, 0, 15), 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(15);
  });

  it("clamps the day when the target month is shorter (Jan 31 → Feb 28)", () => {
    const d = addMonthsClamped(new Date(2026, 0, 31), 1);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28); // 2026 is not a leap year
  });

  it("crosses year boundaries", () => {
    const d = addMonthsClamped(new Date(2026, 10, 30), 3);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(1);
  });
});

describe("nextChargeAfter", () => {
  const now = new Date(2026, 6, 22); // 2026-07-22

  it("advances a current monthly anchor by one month", () => {
    const next = nextChargeAfter(new Date(2026, 6, 20), "month", now);
    expect(next.getMonth()).toBe(7);
    expect(next.getDate()).toBe(20);
  });

  it("advances a yearly charge by a full year — never monthly", () => {
    const next = nextChargeAfter(new Date(2026, 6, 1), "year", now);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(6);
  });

  it("catches up a stale anchor to the future in one call (no back-billing)", () => {
    // Anchor 5 months behind: a naive +1 month would still be in the past,
    // causing a re-charge on every daily run.
    const next = nextChargeAfter(new Date(2026, 1, 10), "month", now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getMonth()).toBe(7); // lands on 2026-08-10
    expect(next.getDate()).toBe(10);
  });

  it("always lands strictly in the future even when the anchor equals now", () => {
    const next = nextChargeAfter(now, "month", now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });
});
