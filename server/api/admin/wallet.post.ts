import { MAX_RECURRING_MONTHLY_USD_CENTS } from "../../../shared/billing";
import type { WalletAdjustPayload } from "../../models/admin";

const CREDIT_TYPES = new Set(["topup", "refund", "adjustment"]);
const DEBIT_TYPES = new Set([
  "hosting",
  "database",
  "feature",
  "change",
  "adjustment",
]);

/**
 * POST /api/admin/wallet (WebForgePlan2 §5)
 *
 * Manually credit or debit a customer's wallet — record an EFT top-up, bill a
 * feature/change ad-hoc, issue a refund, or make a goodwill adjustment. Writes
 * an audit row. All amounts are USD cents.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await readBody<WalletAdjustPayload>(event);

  const customerId = body?.customerId;
  const direction = body?.direction;
  const amount = Math.round(body?.amountUsdCents ?? 0);
  const type = body?.type ?? "adjustment";
  const description = body?.description?.trim() || "Admin adjustment";

  if (!customerId || (direction !== "credit" && direction !== "debit")) {
    throw createError({
      statusCode: 422,
      statusMessage:
        "`customerId` and a `direction` of credit/debit are required.",
    });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "A positive amount is required.",
    });
  }
  // Same sanity cap as recurring charges — a fat-fingered amount would
  // otherwise silently swing a wallet by an absurd sum.
  if (amount > MAX_RECURRING_MONTHLY_USD_CENTS) {
    throw createError({
      statusCode: 422,
      statusMessage: `Amount must be at most $${(
        MAX_RECURRING_MONTHLY_USD_CENTS / 100
      ).toLocaleString("en-US")}.`,
    });
  }
  const allowed = direction === "credit" ? CREDIT_TYPES : DEBIT_TYPES;
  if (!allowed.has(type)) {
    throw createError({
      statusCode: 422,
      statusMessage: `Invalid type "${type}" for a ${direction}.`,
    });
  }

  // Map a debit type to the closest invoice type when raising an invoice.
  const invoiceTypeFor = (t: string): "hosting" | "database" | "feature" =>
    t === "hosting" ? "hosting" : t === "database" ? "database" : "feature";

  let result;
  if (direction === "credit") {
    result = await creditWallet({
      customerId,
      type: type as never,
      amountCents: amount,
      description,
      createdBy: admin.email,
    });
  } else if (body?.createInvoice) {
    // Debit + paid invoice atomically so we never bill without a record.
    result = await useDb().transaction(async (tx) => {
      const r = await debitWallet({
        customerId,
        type: type as never,
        amountCents: amount,
        description,
        createdBy: admin.email,
        allowNegative: body?.force === true,
        tx,
      });
      if (!r.ok) return r;
      await tx.insert(schema.invoices).values({
        customerId,
        type: invoiceTypeFor(type),
        amountCents: amount,
        currency: "USD",
        status: "paid",
        provider: "wallet",
        paidAt: new Date(),
      });
      return r;
    });
  } else {
    result = await debitWallet({
      customerId,
      type: type as never,
      amountCents: amount,
      description,
      createdBy: admin.email,
      allowNegative: body?.force === true,
    });
  }

  if (!result.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: `Insufficient balance (short ${((result.shortfallCents ?? 0) / 100).toFixed(2)} USD). Use force to override.`,
    });
  }

  await writeAudit(
    admin.email,
    `wallet.${direction}`,
    `customer:${customerId} ${type} ${amount}c — ${description}`,
  );

  // A credit (e.g. an EFT recorded manually) may cover services that were
  // paused for non-payment — recover them just like a Paystack top-up would.
  if (direction === "credit") {
    try {
      await recoverSuspendedServices(customerId);
    } catch (err) {
      console.error("[admin/wallet] recovery after credit failed:", err);
    }
  }

  return { ok: true, balanceAfterCents: result.balanceAfterCents };
});
