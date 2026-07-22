import { test, expect } from "@playwright/test";

/**
 * Checkout intake flow (up to — but not including — the brief/Paystack steps,
 * which need Firebase auth and Paystack keys; see payments.spec.ts).
 */

test.describe("checkout start", () => {
  test("pricing card links into the checkout intake with the right plan", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const cta = page
      .locator('a[href="/checkout/start?plan=build_professional"]')
      .first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/checkout\/start\?plan=build_professional/);
    await expect(
      page.getByRole("heading", { name: "Professional" }),
    ).toBeVisible();
    await expect(page.locator("text=$399").first()).toBeVisible();
  });

  test("unknown plan shows a friendly not-found card", async ({ page }) => {
    await page.goto("/checkout/start?plan=not_a_plan");
    await expect(page.locator("text=Plan not found")).toBeVisible();
  });

  test("continue button stays disabled until a valid email is entered", async ({
    page,
  }) => {
    await page.goto("/checkout/start?plan=build_starter", {
      waitUntil: "networkidle",
    });
    // Signed out the CTA reads "Complete brief & continue"; it only becomes
    // "Proceed to secure payment" after sign-in + brief. Either way it is
    // gated on a valid email.
    const continueButton = page.getByRole("button", {
      name: /Complete brief & continue|Complete project brief|Proceed to secure payment/i,
    });
    const email = page.getByPlaceholder("jane@company.com");
    await expect(continueButton).toBeDisabled();
    await email.fill("not-an-email");
    await expect(continueButton).toBeDisabled();
    // Re-fill until Vue hydration has attached the v-model listener — filling
    // a freshly server-rendered input before hydration is silently ignored.
    await expect(async () => {
      await email.fill("jane@company.com");
      await expect(continueButton).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  });

  test("success page without a reference shows a clear no-payment state", async ({
    page,
  }) => {
    await page.goto("/checkout/success");
    await expect(page.locator("text=No payment found")).toBeVisible();
  });

  test("cancel page offers a way back", async ({ page }) => {
    await page.goto("/checkout/cancel");
    await expect(page.locator("text=Checkout cancelled")).toBeVisible();
    await expect(page.locator('a[href="/pricing"]').first()).toBeVisible();
  });
});
