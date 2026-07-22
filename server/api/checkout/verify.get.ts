import { eq } from "drizzle-orm";

/**
 * GET /api/checkout/verify?reference=... (WebForgePlan2 §4.3/§4.6)
 *
 * Called by the success page after Paystack redirects back. Re-verifies with
 * Paystack and then **fulfills** the order via the shared idempotent helper —
 * crediting the wallet (top-up) or marking the invoice paid (build). This makes
 * the success page a reliable fulfillment path so a top-up completes even if the
 * webhook is delayed or not configured. Safe to run alongside the webhook
 * (idempotent on the reference).
 */
export default defineEventHandler(async (event) => {
  const reference = String(getQuery(event).reference ?? "").trim();
  if (!reference) {
    throw createError({
      statusCode: 422,
      statusMessage: "`reference` is required.",
    });
  }

  try {
    const result = await finalizeByReference(reference);
    if (!result.ok && result.status === "verify_failed") {
      const db = useDb();
      const [invoice] = await db
        .select({
          status: schema.invoices.status,
          type: schema.invoices.type,
        })
        .from(schema.invoices)
        .where(eq(schema.invoices.providerInvoiceId, reference))
        .limit(1);

      if (invoice?.status === "paid") {
        return {
          reference,
          status: "success",
          kind: invoice.type,
          paid: true,
          balanceAfterCents: null,
        };
      }

      // Top-ups leave a wallet ledger row keyed by the reference — check it
      // too, so a transient Paystack verify failure after the webhook already
      // credited doesn't show the customer a pending state.
      if (await walletHasReference(reference)) {
        return {
          reference,
          status: "success",
          kind: "topup",
          paid: true,
          balanceAfterCents: null,
        };
      }
    }

    return {
      reference,
      status: result.status,
      // Only disclose the transaction kind once payment is confirmed, so an
      // attacker can't probe references to learn whether/what they map to.
      kind:
        result.ok && result.status === "success" ? (result.kind ?? null) : null,
      paid: result.ok && result.status === "success",
      balanceAfterCents: result.balanceAfterCents ?? null,
    };
  } catch (err) {
    console.error(
      `[checkout/verify] fulfillment failed for ${reference}:`,
      err,
    );
    // Don't leak details; the UI just shows a pending/contact-us state.
    return { reference, status: "unknown", paid: false };
  }
});
