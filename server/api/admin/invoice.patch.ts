import { eq } from "drizzle-orm";
import { INVOICE_ACTIONS, type InvoiceActionPayload } from "../../models/admin";

/**
 * PATCH /api/admin/invoice — mark an invoice paid (manual/EFT), void it
 * (recorded as "failed"), or refund it.
 *
 * Refund routing: a Paystack-settled invoice is refunded via the Paystack API;
 * a wallet-settled invoice is refunded by crediting the wallet back.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await readBody<InvoiceActionPayload>(event);

  if (!body?.id || !body?.action || !INVOICE_ACTIONS.includes(body.action)) {
    throw createError({
      statusCode: 422,
      statusMessage: "A valid `id` and `action` are required.",
    });
  }

  const db = useDb();
  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, body.id))
    .limit(1);
  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: "Invoice not found." });
  }

  if (body.action === "mark_paid") {
    if (invoice.status === "paid") {
      throw createError({
        statusCode: 409,
        statusMessage: "Invoice is already paid.",
      });
    }
    // A refunded invoice must stay refunded — flipping it back to paid would
    // re-arm the refund button (double-refund risk) and double-count revenue.
    if (invoice.status === "refunded") {
      throw createError({
        statusCode: 409,
        statusMessage: "A refunded invoice can't be marked paid again.",
      });
    }
    await db
      .update(schema.invoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(schema.invoices.id, invoice.id));
  } else if (body.action === "void") {
    if (invoice.status === "paid") {
      throw createError({
        statusCode: 409,
        statusMessage: "Refund a paid invoice instead of voiding it.",
      });
    }
    // No dedicated "void" status — record as failed and label it in the UI.
    await db
      .update(schema.invoices)
      .set({ status: "failed" })
      .where(eq(schema.invoices.id, invoice.id));
  } else {
    // refund
    if (invoice.status !== "paid") {
      throw createError({
        statusCode: 409,
        statusMessage: "Only a paid invoice can be refunded.",
      });
    }
    if (invoice.provider === "wallet") {
      // Credit the wallet back (USD). Idempotent on the refund reference.
      const credit = await creditWallet({
        customerId: invoice.customerId,
        type: "refund",
        amountCents: invoice.amountCents,
        description: `Refund for invoice #${String(invoice.number).padStart(5, "0")}`,
        reference: `twf_refund_${invoice.id}`,
        createdBy: admin.email,
      });
      if (!credit.ok && !credit.duplicate) {
        throw createError({
          statusCode: 500,
          statusMessage: "Wallet refund failed.",
        });
      }
    } else if (invoice.providerInvoiceId) {
      // Paystack refund (full amount of the original transaction).
      await refundTransaction({ reference: invoice.providerInvoiceId });
    } else {
      // No wallet provider and no Paystack reference (e.g. EFT marked paid
      // manually) — there is no channel to move money back through, so
      // refuse rather than flag "refunded" while the customer got nothing.
      throw createError({
        statusCode: 409,
        statusMessage:
          "This invoice has no refundable payment on record. Credit the wallet manually instead.",
      });
    }
    await db
      .update(schema.invoices)
      .set({ status: "refunded" })
      .where(eq(schema.invoices.id, invoice.id));
  }

  await writeAudit(admin.email, `invoice.${body.action}`, invoice.id);

  const [updated] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoice.id))
    .limit(1);
  return { ok: true, invoice: updated };
});
