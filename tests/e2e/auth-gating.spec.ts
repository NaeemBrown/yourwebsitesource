import { test, expect } from "@playwright/test";

/**
 * Signed-out gating for the customer portal and the admin area, plus the
 * server-side auth guards and input validation on the API. None of these need
 * a database or Firebase secrets: the guards reject anonymous requests before
 * any DB access, and the public APIs serve compiled-in content.
 */

test.describe("auth gating (signed out)", () => {
  test("account page never shows the signed-in dashboard", async ({ page }) => {
    await page.goto("/account");
    // With Firebase configured the page asks for Google sign-in; without it,
    // it shows the not-configured notice. Either way: no dashboard.
    await expect(
      page
        .getByText("Continue with Google")
        .or(page.getByText("Sign-in unavailable"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "My account" })).toHaveCount(
      0,
    );
  });

  test("admin login page renders its sign-in card", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(
      page.getByRole("heading", { name: "Admin sign in" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("API auth guards", () => {
  test("customer endpoints reject anonymous requests", async ({ request }) => {
    for (const path of [
      "/api/account/wallet",
      "/api/account/transactions",
      "/api/account/billing",
      "/api/account/projects",
      "/api/account/invoice-pdf?id=00000000-0000-0000-0000-000000000001",
    ]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
    const posts: Array<[string, "post" | "patch", Record<string, unknown>]> = [
      [
        "/api/account/change-request",
        "post",
        { title: "Test", details: "This should be rejected." },
      ],
      ["/api/account/change-request", "patch", { id: "x", action: "approve" }],
      ["/api/account/recurring", "patch", { id: "x" }],
    ];
    for (const [path, method, data] of posts) {
      const res = await request[method](path, { data });
      expect(res.status(), `${method} ${path}`).toBe(401);
    }
  });

  test("admin endpoints reject anonymous requests", async ({ request }) => {
    for (const path of [
      "/api/admin/me",
      "/api/admin/customers",
      "/api/admin/overview",
      "/api/admin/billing",
      "/api/admin/sites",
      "/api/admin/domains",
      "/api/admin/leads",
      "/api/admin/change-requests",
      "/api/admin/projects",
    ]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
    const posts: Array<[string, "post" | "patch", Record<string, unknown>]> = [
      [
        "/api/admin/wallet",
        "post",
        { customerId: "x", direction: "credit", amountUsdCents: 100 },
      ],
      [
        "/api/admin/sites",
        "post",
        { customerId: "x", name: "Test", type: "static", origin: "built" },
      ],
      ["/api/admin/domains", "post", { customerId: "x", fqdn: "example.com" }],
      ["/api/admin/change-requests", "patch", { id: "x", quotedUsdCents: 100 }],
      [
        "/api/admin/recurring",
        "post",
        { customerId: "x", planKey: "hosting_static" },
      ],
    ];
    for (const [path, method, data] of posts) {
      const res = await request[method](path, { data });
      expect(res.status(), `${method} ${path}`).toBe(401);
    }
  });

  test("admin endpoints reject a forged bearer token", async ({ request }) => {
    const res = await request.get("/api/admin/customers", {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("API validation", () => {
  test("contact form rejects incomplete submissions", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: { name: "A", email: "bad", message: "hi" },
    });
    expect(res.status()).toBe(422);
  });

  test("contact form honeypot silently swallows bots", async ({ request }) => {
    const res = await request.post("/api/contact", {
      data: {
        name: "Bot",
        email: "bot@spam.com",
        message: "buy things now!!",
        website: "http://spam",
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe("ignored");
  });

  test("checkout create requires a signed-in customer", async ({ request }) => {
    // Every purchase is tied to an authenticated account — anonymous callers
    // are rejected before any validation or DB work.
    const build = await request.post("/api/checkout/create", {
      data: {
        purpose: "build",
        planKey: "build_starter",
        email: "jane@company.com",
      },
    });
    expect(build.status()).toBe(401);

    const topup = await request.post("/api/checkout/create", {
      data: {
        purpose: "topup",
        amountUsdCents: 100,
        email: "jane@company.com",
      },
    });
    expect(topup.status()).toBe(401);
  });

  test("public projects + stats APIs respond", async ({ request }) => {
    const projects = await request.get("/api/projects");
    expect(projects.status()).toBe(200);
    expect((await projects.json()).count).toBeGreaterThan(0);

    const stats = await request.get("/api/stats");
    expect(stats.status()).toBe(200);
  });
});
