import { test, expect } from "@playwright/test";

/**
 * Public-page checks that complement smoke.spec.ts: the home hero, the
 * pricing page's post-care-plan content, and the contact form. (Package
 * labels, showcase, nav, and legal pages are covered by smoke.spec.ts.)
 */

test.describe("public pages", () => {
  test("home page renders the hero with its CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TheWebsiteForge|Website Forge/i);
    await expect(page.locator('a[href="/showcase"]').first()).toBeVisible();
    await expect(page.locator('a[href="/pricing"]').first()).toBeVisible();
  });

  test("pricing page shows hosting but NOT the removed care plans", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await expect(page.locator("text=Dynamic Hosting").first()).toBeVisible();
    // Care plans are removed — change requests replace them.
    await expect(page.locator("text=Basic Care")).toHaveCount(0);
    await expect(page.locator("text=Plus Care")).toHaveCount(0);
    await expect(page.locator("text=Care plans")).toHaveCount(0);
  });

  test("pricing page explains change requests and bring-your-own hosting", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await expect(
      page.locator("text=Changes after launch").first(),
    ).toBeVisible();
    await expect(
      page.locator("text=Already have a website?").first(),
    ).toBeVisible();
    await expect(page.locator('a[href="/contact"]').first()).toBeVisible();
  });

  test("contact page renders the lead form", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator("form").first()).toBeVisible();
  });
});
