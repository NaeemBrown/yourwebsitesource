import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../server/database/schema";

/**
 * DB-backed integration tests for the money paths: the wallet ledger
 * (credit/debit/idempotency/concurrency) and the suspension-recovery flow.
 * Needs Postgres up + migrated (`pnpm db:up && pnpm db:migrate`); each test
 * uses its own throwaway customer, cleaned up afterwards.
 *
 * The whole suite skips cleanly when DATABASE_URL is unset OR the database is
 * unreachable, so `pnpm test:run` stays green without Docker.
 */

const HAS_DB = await (async () => {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
})();
const d = describe.skipIf(!HAS_DB);

let useDb: typeof import("../../server/utils/db").useDb;
let wallet: typeof import("../../server/utils/wallet");
let recovery: typeof import("../../server/utils/recovery");

const createdCustomerIds: string[] = [];

async function makeCustomer(balanceCents = 0) {
  const db = useDb();
  const [customer] = await db
    .insert(schema.customers)
    .values({
      name: "Test Customer",
      email: `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@integration.test`,
      walletBalanceCents: 0,
    })
    .returning();
  createdCustomerIds.push(customer!.id);
  if (balanceCents > 0) {
    await wallet.creditWallet({
      customerId: customer!.id,
      type: "topup",
      amountCents: balanceCents,
      description: "Test seed credit",
    });
  }
  return customer!;
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await import("./setup");
  ({ useDb } = await import("../../server/utils/db"));
  wallet = await import("../../server/utils/wallet");
  recovery = await import("../../server/utils/recovery");
});

afterAll(async () => {
  if (!HAS_DB || !createdCustomerIds.length) return;
  const db = useDb();
  for (const id of createdCustomerIds) {
    await db.delete(schema.customers).where(eq(schema.customers.id, id));
  }
});

d("wallet ledger", () => {
  it("credit then debit keeps the cached balance and ledger in sync", async () => {
    const customer = await makeCustomer();
    const credit = await wallet.creditWallet({
      customerId: customer.id,
      type: "topup",
      amountCents: 10_000,
      description: "Top-up",
    });
    expect(credit.ok).toBe(true);
    expect(credit.balanceAfterCents).toBe(10_000);

    const debit = await wallet.debitWallet({
      customerId: customer.id,
      type: "hosting",
      amountCents: 4_500,
      description: "Hosting",
    });
    expect(debit.ok).toBe(true);
    expect(debit.balanceAfterCents).toBe(5_500);

    expect(await wallet.getWalletBalance(customer.id)).toBe(5_500);

    const db = useDb();
    const rows = await db
      .select()
      .from(schema.walletTransactions)
      .where(eq(schema.walletTransactions.customerId, customer.id));
    const ledgerSum = rows.reduce((sum, r) => sum + r.amountCents, 0);
    expect(ledgerSum).toBe(5_500);
  });

  it("declines a debit that would go negative (with the shortfall)", async () => {
    const customer = await makeCustomer(1_000);
    const debit = await wallet.debitWallet({
      customerId: customer.id,
      type: "hosting",
      amountCents: 4_500,
      description: "Hosting",
    });
    expect(debit.ok).toBe(false);
    expect(debit.shortfallCents).toBe(3_500);
    expect(await wallet.getWalletBalance(customer.id)).toBe(1_000);
  });

  it("allows a negative balance only with allowNegative", async () => {
    const customer = await makeCustomer(1_000);
    const debit = await wallet.debitWallet({
      customerId: customer.id,
      type: "feature",
      amountCents: 4_500,
      description: "Wallet applied to build",
      allowNegative: true,
    });
    expect(debit.ok).toBe(true);
    expect(debit.balanceAfterCents).toBe(-3_500);
  });

  it("never double-credits the same Paystack reference", async () => {
    const customer = await makeCustomer();
    const reference = `it_ref_${Date.now()}`;
    const first = await wallet.creditWallet({
      customerId: customer.id,
      type: "topup",
      amountCents: 5_000,
      description: "Top-up",
      reference,
    });
    expect(first.ok).toBe(true);

    const second = await wallet.creditWallet({
      customerId: customer.id,
      type: "topup",
      amountCents: 5_000,
      description: "Top-up (retry)",
      reference,
    });
    expect(second.ok).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await wallet.getWalletBalance(customer.id)).toBe(5_000);
    expect(await wallet.walletHasReference(reference)).toBe(true);
  });

  it("serializes concurrent debits — no lost updates, no double-spend", async () => {
    const customer = await makeCustomer(10_000);
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        wallet.debitWallet({
          customerId: customer.id,
          type: "hosting",
          amountCents: 3_000,
          description: `Concurrent debit ${i}`,
        }),
      ),
    );
    const succeeded = results.filter((r) => r.ok).length;
    // 10_000 / 3_000 → exactly 3 can succeed; the 4th must be declined.
    expect(succeeded).toBe(3);
    expect(await wallet.getWalletBalance(customer.id)).toBe(1_000);
  });
});

d("suspension recovery", () => {
  async function makeSuspendedSetup(balanceCents: number) {
    const customer = await makeCustomer(balanceCents);
    const db = useDb();
    const [site] = await db
      .insert(schema.sites)
      .values({
        customerId: customer.id,
        name: "Suspended Site",
        type: "static",
        origin: "built",
        status: "suspended",
      })
      .returning();
    const [charge] = await db
      .insert(schema.recurringCharges)
      .values({
        customerId: customer.id,
        siteId: site!.id,
        kind: "hosting",
        planKey: "hosting_static",
        label: "Static Hosting",
        amountCents: 1_500,
        status: "paused",
        lowBalanceNotifiedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
        nextChargeAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      })
      .returning();
    return { customer, site: site!, charge: charge! };
  }

  it("a covering top-up re-charges, resumes billing on a future date, and restores the site", async () => {
    const { customer, site, charge } = await makeSuspendedSetup(5_000);

    const result = await recovery.recoverSuspendedServices(customer.id);
    expect(result.restored).toBe(1);

    const db = useDb();
    const [rc] = await db
      .select()
      .from(schema.recurringCharges)
      .where(eq(schema.recurringCharges.id, charge.id));
    expect(rc!.status).toBe("active");
    expect(rc!.lowBalanceNotifiedAt).toBeNull();
    expect(new Date(rc!.nextChargeAt).getTime()).toBeGreaterThan(Date.now());

    const [s] = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.id, site.id));
    expect(s!.status).toBe("live");

    // The missed charge was actually debited.
    expect(await wallet.getWalletBalance(customer.id)).toBe(3_500);
  });

  it("leaves the service paused when the balance still can't cover it", async () => {
    const { customer, charge } = await makeSuspendedSetup(500);

    const result = await recovery.recoverSuspendedServices(customer.id);
    expect(result.restored).toBe(0);

    const db = useDb();
    const [rc] = await db
      .select()
      .from(schema.recurringCharges)
      .where(eq(schema.recurringCharges.id, charge.id));
    expect(rc!.status).toBe("paused");
    expect(await wallet.getWalletBalance(customer.id)).toBe(500);
  });

  it("never touches services an admin paused deliberately", async () => {
    const customer = await makeCustomer(10_000);
    const db = useDb();
    const [charge] = await db
      .insert(schema.recurringCharges)
      .values({
        customerId: customer.id,
        kind: "hosting",
        label: "Admin-paused Hosting",
        amountCents: 1_500,
        status: "paused",
        lowBalanceNotifiedAt: null, // deliberate pause — no dunning flag
        nextChargeAt: new Date(),
      })
      .returning();

    const result = await recovery.recoverSuspendedServices(customer.id);
    expect(result.restored).toBe(0);

    const [rc] = await db
      .select()
      .from(schema.recurringCharges)
      .where(eq(schema.recurringCharges.id, charge!.id));
    expect(rc!.status).toBe("paused");
    expect(await wallet.getWalletBalance(customer.id)).toBe(10_000);
  });
});
