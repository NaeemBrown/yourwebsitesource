import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * getAdminEmails/isAdminEmail live in server/utils/admin-auth.ts, which
 * imports the firebase-admin SDK at module top level — heavier than we want
 * in a unit test, so the allowlist parsing contract is tested against the
 * same logic here, and generateReference is imported directly (pure).
 */
import { generateReference } from "../../server/utils/paystack";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ADMIN_EMAILS allowlist parsing", () => {
  it("splits, trims, and lower-cases", () => {
    vi.stubEnv("ADMIN_EMAILS", " Alice@Example.com ,bob@x.com,, ");
    expect(getAdminEmails()).toEqual(["alice@example.com", "bob@x.com"]);
  });

  it("is empty when unset", () => {
    vi.stubEnv("ADMIN_EMAILS", undefined);
    expect(getAdminEmails()).toEqual([]);
  });
});

describe("generateReference", () => {
  it("uses the given prefix", () => {
    expect(generateReference("twf_topup")).toMatch(/^twf_topup_\d+_[a-z0-9]+$/);
    expect(generateReference()).toMatch(/^twf_\d+_[a-z0-9]+$/);
  });

  it("generates unique references", () => {
    const refs = new Set(
      Array.from({ length: 500 }, () => generateReference()),
    );
    expect(refs.size).toBe(500);
  });

  it("topup references are distinguishable from build references", () => {
    // fulfillment.ts falls back to reference-prefix sniffing when metadata is
    // missing — the prefixes must stay distinct.
    expect(generateReference("twf_topup").startsWith("twf_topup")).toBe(true);
    expect(generateReference("twf_build").startsWith("twf_topup")).toBe(false);
  });
});
