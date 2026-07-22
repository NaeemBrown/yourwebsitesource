import { describe, it, expect } from "vitest";
import { buildDomainDigest } from "../../server/utils/domain-digest";
import { domainExpiryDigestEmail } from "../../server/utils/email-templates";

const NOW = new Date(2026, 6, 22); // 2026-07-22
const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY_MS);

function domain(fqdn: string, expiresInDays: number | null, autoRenew = true) {
  return {
    fqdn,
    customerName: "Test Co",
    expiresAt: expiresInDays == null ? null : inDays(expiresInDays),
    autoRenew,
  };
}

describe("buildDomainDigest", () => {
  it("buckets domains into expired / urgent (≤7d) / upcoming (8–30d)", () => {
    const digest = buildDomainDigest(
      [
        domain("gone.com", -3),
        domain("panic.com", 2),
        domain("soon.com", 14),
        domain("boundary7.com", 7),
        domain("boundary30.com", 30),
      ],
      NOW,
    );
    expect(digest.expired.map((e) => e.fqdn)).toEqual(["gone.com"]);
    expect(digest.urgent.map((e) => e.fqdn)).toEqual([
      "panic.com",
      "boundary7.com",
    ]);
    expect(digest.upcoming.map((e) => e.fqdn)).toEqual([
      "soon.com",
      "boundary30.com",
    ]);
    expect(digest.total).toBe(5);
  });

  it("ignores domains beyond 30 days or without an expiry date", () => {
    const digest = buildDomainDigest(
      [
        domain("far.com", 31),
        domain("later.com", 200),
        domain("unknown.com", null),
      ],
      NOW,
    );
    expect(digest.total).toBe(0);
  });

  it("sorts each bucket soonest-first", () => {
    const digest = buildDomainDigest(
      [domain("b.com", 20), domain("a.com", 10), domain("c.com", 29)],
      NOW,
    );
    expect(digest.upcoming.map((e) => e.fqdn)).toEqual([
      "a.com",
      "b.com",
      "c.com",
    ]);
  });

  it("computes signed days-left values", () => {
    const digest = buildDomainDigest(
      [domain("gone.com", -5), domain("ok.com", 6)],
      NOW,
    );
    expect(digest.expired[0]!.daysLeft).toBe(-5);
    expect(digest.urgent[0]!.daysLeft).toBe(6);
  });
});

describe("domainExpiryDigestEmail", () => {
  it("lists every bucket, flags manual renewals, and counts the subject", () => {
    const digest = buildDomainDigest(
      [
        domain("gone.com", -3, false),
        domain("panic.com", 2),
        domain("soon.com", 14),
      ],
      NOW,
    );
    const mail = domainExpiryDigestEmail({ digest });
    expect(mail.subject).toContain("3 need");
    expect(mail.subject).toContain("EXPIRED");
    expect(mail.html).toContain("gone.com");
    expect(mail.html).toContain("panic.com");
    expect(mail.html).toContain("soon.com");
    expect(mail.text).toContain("[manual renew]");
    expect(mail.text).toContain("expired 3d ago");
  });

  it("escapes hostile customer names", () => {
    const digest = buildDomainDigest(
      [
        {
          fqdn: "x.com",
          customerName: "<script>x</script>",
          expiresAt: inDays(5),
          autoRenew: true,
        },
      ],
      NOW,
    );
    const mail = domainExpiryDigestEmail({ digest });
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
