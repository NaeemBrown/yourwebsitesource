import { describe, it, expect } from "vitest";
import * as site from "../../shared/site";

/**
 * Content-regression tests: the public marketing copy must match what the
 * billing system can actually deliver.
 */
describe("shared/site content", () => {
  it("care plans are fully removed (change requests replace them)", () => {
    expect("carePlans" in site).toBe(false);
    const blob = JSON.stringify(site);
    expect(blob).not.toMatch(/care plan/i);
    expect(blob).not.toMatch(/Basic Care|Plus Care/);
  });

  it("no stale brand names in testimonials or FAQs", () => {
    const blob = JSON.stringify([site.testimonials, site.faqs]);
    expect(blob).not.toContain("Lumina");
  });

  it("FAQs reference the real package names, not retired tiers", () => {
    const blob = JSON.stringify(site.faqs);
    expect(blob).not.toMatch(
      /Launch one-pager|Studio multi-page|Scale plans|Studio includes/,
    );
    expect(blob).toContain("Starter");
  });

  it("every fixed pricing tier maps to a purchasable billing catalogue key", async () => {
    const { getBuildPackage } = await import("../../shared/billing");
    for (const tier of site.pricingTiers) {
      if (!tier.fixed) {
        // Quote-based tiers (Custom) have no catalogue entry by design.
        expect(tier.planKey, tier.id).toBeUndefined();
        continue;
      }
      expect(tier.planKey, tier.id).toBeTruthy();
      const pkg = getBuildPackage(tier.planKey!);
      expect(pkg, `${tier.id} → ${tier.planKey}`).toBeDefined();
      // Card price (major units) must equal the catalogue price.
      expect(pkg!.amountUsdCents).toBe(tier.price * 100);
    }
  });

  it("hosting plan cards match the recurring catalogue prices", async () => {
    const { recurringServices } = await import("../../shared/billing");
    const byId: Record<string, string> = {
      static: "hosting_static",
      dynamic: "hosting_dynamic",
      app: "hosting_app",
    };
    for (const plan of site.hostingPlans) {
      const svc = recurringServices[byId[plan.id]!];
      expect(svc, plan.id).toBeDefined();
      expect(svc!.amountUsdCents).toBe(plan.price * 100);
    }
  });

  it("database tier cards match the recurring catalogue (self-hosted and managed)", async () => {
    const { recurringServices } = await import("../../shared/billing");
    const bySize: Record<string, [string, string]> = {
      "db-small": ["db_self_small", "db_managed_small"],
      "db-medium": ["db_self_medium", "db_managed_medium"],
      "db-large": ["db_self_large", "db_managed_large"],
    };
    for (const tier of site.databaseTiers) {
      const [selfKey, managedKey] = bySize[tier.id]!;
      expect(recurringServices[selfKey]!.amountUsdCents).toBe(tier.price * 100);
      expect(recurringServices[managedKey]!.amountUsdCents).toBe(
        (tier.managedPrice ?? 0) * 100,
      );
    }
  });
});
