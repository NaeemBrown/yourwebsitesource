import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getUsdToZarRate,
  usdCentsToZarCents,
  formatUsd,
  formatZar,
} from "../../server/utils/fx";

const DEFAULT_RATE = 17;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getUsdToZarRate", () => {
  it("falls back to the default when unset", () => {
    vi.stubEnv("USD_TO_ZAR", undefined);
    expect(getUsdToZarRate()).toBe(DEFAULT_RATE);
  });

  it("uses a valid in-band rate from the environment", () => {
    vi.stubEnv("USD_TO_ZAR", "18.5");
    expect(getUsdToZarRate()).toBe(18.5);
  });

  it("falls back to the default for out-of-band or invalid rates", () => {
    vi.stubEnv("USD_TO_ZAR", "5"); // below MIN
    expect(getUsdToZarRate()).toBe(DEFAULT_RATE);

    vi.stubEnv("USD_TO_ZAR", "100"); // above MAX (stray decimal)
    expect(getUsdToZarRate()).toBe(DEFAULT_RATE);

    vi.stubEnv("USD_TO_ZAR", "abc"); // not a number
    expect(getUsdToZarRate()).toBe(DEFAULT_RATE);

    vi.stubEnv("USD_TO_ZAR", "");
    expect(getUsdToZarRate()).toBe(DEFAULT_RATE);
  });
});

describe("usdCentsToZarCents (never under-collect)", () => {
  it("converts whole amounts exactly", () => {
    vi.stubEnv("USD_TO_ZAR", "18");
    // $50 * 18 = R900 = 90000 ZAR cents
    expect(usdCentsToZarCents(5_000)).toBe(90_000);
  });

  it("always rounds UP to a whole rand so we never charge less", () => {
    vi.stubEnv("USD_TO_ZAR", "18");
    // $24.99 * 18 = R449.82 -> ceil to R450 -> 45000 cents
    expect(usdCentsToZarCents(2_499)).toBe(45_000);

    vi.stubEnv("USD_TO_ZAR", "17");
    // $0.01 * 17 = R0.17 -> ceil to R1 -> 100 cents
    expect(usdCentsToZarCents(1)).toBe(100);
  });

  it("always returns a whole-rand amount (multiple of 100 cents)", () => {
    vi.stubEnv("USD_TO_ZAR", "21");
    for (const usd of [1, 99, 100, 2_499, 5_000, 39_900]) {
      expect(usdCentsToZarCents(usd) % 100).toBe(0);
    }
  });

  it("zero converts to zero", () => {
    vi.stubEnv("USD_TO_ZAR", "18");
    expect(usdCentsToZarCents(0)).toBe(0);
  });
});

describe("formatters", () => {
  it("formatUsd drops decimals for whole amounts", () => {
    expect(formatUsd(24_900)).toBe("$249");
    expect(formatUsd(3_750)).toBe("$37.50");
  });

  it("formatZar formats Rands", () => {
    // Digits only — the en-ZA currency symbol/separators vary by ICU build.
    expect(formatZar(85_100).replace(/\D/g, "")).toBe("851");
  });
});
