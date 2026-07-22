import { describe, it, expect } from "vitest";
import {
  buildPackages,
  getBuildPackage,
  getRecurringService,
  recurringServices,
  formatUsdCents,
  estimateZar,
  MIN_TOPUP_USD_CENTS,
  MAX_TOPUP_USD_CENTS,
  MAX_RECURRING_MONTHLY_USD_CENTS,
  TOPUP_PRESETS_USD_CENTS,
} from "../../shared/billing";

describe("build packages", () => {
  it("looks up known packages and returns undefined otherwise", () => {
    expect(getBuildPackage("build_starter")?.amountUsdCents).toBe(24_900);
    expect(getBuildPackage("build_starter")?.label).toBe("Starter");
    expect(getBuildPackage("nope")).toBeUndefined();
    expect(getBuildPackage("")).toBeUndefined();
  });

  it("exposes the three build packages at the advertised prices", () => {
    expect(buildPackages.build_starter?.amountUsdCents).toBe(24_900);
    expect(buildPackages.build_professional?.amountUsdCents).toBe(39_900);
    expect(buildPackages.build_business?.amountUsdCents).toBe(69_900);
  });

  it("every catalogue entry has a positive integer price", () => {
    for (const pkg of Object.values(buildPackages)) {
      expect(Number.isInteger(pkg.amountUsdCents)).toBe(true);
      expect(pkg.amountUsdCents).toBeGreaterThan(0);
    }
  });

  it("every catalogue entry's key matches its map key", () => {
    for (const [key, pkg] of Object.entries(buildPackages)) {
      expect(pkg.key).toBe(key);
    }
    for (const [key, svc] of Object.entries(recurringServices)) {
      expect(svc.key).toBe(key);
    }
  });
});

describe("recurring services", () => {
  it("looks up known services", () => {
    expect(getRecurringService("hosting_static")?.amountUsdCents).toBe(1_500);
    expect(getRecurringService("hosting_dynamic")?.kind).toBe("hosting");
    expect(getRecurringService("nope")).toBeUndefined();
  });

  it("all priced under the monthly cap", () => {
    for (const svc of Object.values(recurringServices)) {
      expect(Number.isInteger(svc.amountUsdCents)).toBe(true);
      expect(svc.amountUsdCents).toBeGreaterThan(0);
      expect(svc.amountUsdCents).toBeLessThanOrEqual(
        MAX_RECURRING_MONTHLY_USD_CENTS,
      );
    }
  });

  it("managed database tiers cost 50% more than self-hosted", () => {
    expect(recurringServices.db_managed_small!.amountUsdCents).toBe(
      recurringServices.db_self_small!.amountUsdCents * 1.5,
    );
    expect(recurringServices.db_managed_medium!.amountUsdCents).toBe(
      recurringServices.db_self_medium!.amountUsdCents * 1.5,
    );
    expect(recurringServices.db_managed_large!.amountUsdCents).toBe(
      recurringServices.db_self_large!.amountUsdCents * 1.5,
    );
  });
});

describe("top-up bounds (enforced by /api/checkout/create)", () => {
  it("has a sane min/max ordering and presets within range", () => {
    expect(MIN_TOPUP_USD_CENTS).toBeLessThan(MAX_TOPUP_USD_CENTS);
    for (const preset of TOPUP_PRESETS_USD_CENTS) {
      expect(preset).toBeGreaterThanOrEqual(MIN_TOPUP_USD_CENTS);
      expect(preset).toBeLessThanOrEqual(MAX_TOPUP_USD_CENTS);
    }
  });

  it("MAX_RECURRING_MONTHLY_USD_CENTS is $100,000 (regression: B-A5 literal fix)", () => {
    expect(MAX_RECURRING_MONTHLY_USD_CENTS).toBe(10_000_000);
    expect(MAX_RECURRING_MONTHLY_USD_CENTS / 100).toBe(100_000);
  });
});

describe("formatUsdCents", () => {
  it("drops decimals for whole dollars", () => {
    expect(formatUsdCents(24_900)).toBe("$249");
    expect(formatUsdCents(0)).toBe("$0");
  });

  it("keeps cents for fractional dollars", () => {
    expect(formatUsdCents(3_750)).toBe("$37.50");
    expect(formatUsdCents(149_999)).toBe("$1,499.99");
  });

  it("groups thousands", () => {
    expect(formatUsdCents(1_234_500)).toBe("$12,345");
  });
});

describe("estimateZar (display only)", () => {
  // Compare digits only — the en-ZA currency symbol/separators vary by ICU build.
  const rands = (s: string) => s.replace(/\D/g, "");

  it("rounds up to whole rand at the given rate", () => {
    expect(rands(estimateZar(5_000, 17))).toBe("850"); // $50 * 17 = R850
    expect(rands(estimateZar(2_499, 18))).toBe("450"); // $24.99 * 18 = R449.82 -> R450
  });
});
