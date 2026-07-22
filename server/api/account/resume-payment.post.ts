import { and, eq } from "drizzle-orm";
import { CHARGE_CURRENCY } from "../../../shared/billing";
import type { CheckoutResponse } from "../../../shared/checkout";

/**
 * POST /api/account/resume-payment
 *
 * Completes payment for an EXISTING `awaiting_payment` build — used by the
 * "Complete payment" action in the account portal. Unlike re-running checkout
 * from /pricing (which would mint a brand-new invoice + project and orphan the
 * old one), this re-initialises Paystack against the customer's existing open
 * build invoice, so no duplicate records are created.
 *
 * Accepts `{ projectId }` (preferred) or `{ invoiceId }`. Returns the same
 * shape as /api/checkout/create so the client redirect logic is reused.
 */
export default defineEventHandler(async (event): Promise<CheckoutResponse> => {
  const identity = await requireCustomer(event);
  const customer = await resolveCustomer(identity);
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: "Account not found." });
  }

  const body = await readBody<{ projectId?: string; invoiceId?: string }>(
    event,
  );
  const projectId = body?.projectId?.trim();
  const invoiceId = body?.invoiceId?.trim();
  if (!projectId && !invoiceId) {
    throw createError({
      statusCode: 422,
      statusMessage: "A projectId or invoiceId is required.",
    });
  }

  const db = useDb();

  // Resolve the target build invoice, always scoped to the signed-in customer
  // so one customer can never pay against another's order.
  let project: typeof schema.projects.$inferSelect | undefined;
  let targetInvoiceId = invoiceId;

  if (projectId) {
    [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.customerId, customer.id),
        ),
      )
      .limit(1);
    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: "Project not found.",
      });
    }
    if (!project.invoiceId) {
      throw createError({
        statusCode: 409,
        statusMessage: "This project has no invoice to pay.",
      });
    }
    targetInvoiceId = project.invoiceId;
  }

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.id, targetInvoiceId!),
        eq(schema.invoices.customerId, customer.id),
      ),
    )
    .limit(1);

  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: "Invoice not found." });
  }
  if (invoice.status === "paid") {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This invoice is already paid. Refresh to see your project.",
    });
  }
  if (invoice.type !== "build" || invoice.status !== "open") {
    throw createError({
      statusCode: 409,
      statusMessage: "This invoice can't be paid online.",
    });
  }

  // Safety net: if the original reference actually succeeded at Paystack but
  // fulfillment never ran (rare webhook+verify miss), settle it now instead of
  // charging again.
  if (invoice.providerInvoiceId) {
    try {
      const result = await finalizeByReference(invoice.providerInvoiceId);
      if (result.ok && result.status === "success") {
        throw createError({
          statusCode: 409,
          statusMessage:
            "Payment already received. Refresh to see your project.",
        });
      }
    } catch (err) {
      // A 409 above is intentional — rethrow it. Any other error means the old
      // reference isn't a completed payment, so fall through and reissue.
      if ((err as { statusCode?: number })?.statusCode === 409) throw err;
    }
  }

  // Reissue a fresh reference. Paystack rejects re-initialising a reference it
  // has already seen, so a new one is the robust path; fulfillment matches on
  // providerInvoiceId, which is repointed only AFTER Paystack accepts the init
  // so a failed init can't leave the invoice pointing at a reference Paystack
  // has never seen. (Residual: a payment completed on the OLD authorization
  // page after the repoint resolves to no_invoice and needs a manual refund —
  // the admin sees it in the Paystack dashboard as an unmatched charge.)
  const reference = generateReference("twf_build");

  const usdCents = invoice.amountCents;
  const zarCents = usdCentsToZarCents(usdCents);
  const fxRate = String(getUsdToZarRate());

  const config = useRuntimeConfig(event);
  const siteUrl =
    (config.public?.siteUrl as string) ||
    process.env.NUXT_PUBLIC_SITE_URL ||
    getRequestURL(event).origin;
  const callbackUrl = `${siteUrl.replace(/\/$/, "")}/checkout/success?reference=${reference}`;
  const label = project?.name || "Website build";

  try {
    const result = await initializeTransaction({
      email: customer.email,
      amountCents: zarCents,
      reference,
      callbackUrl,
      currency: CHARGE_CURRENCY,
      metadata: {
        purpose: "build",
        planKey: project?.planKey ?? null,
        customerId: customer.id,
        siteId: invoice.siteId,
        usdCents,
        // Open build invoices were never wallet-debited, so resume charges the
        // full amount via Paystack.
        walletApplyCents: 0,
        zarCents,
        fxRate,
        label,
        sig: signCheckoutMetadata({
          purpose: "build",
          customerId: customer.id,
          reference,
          usdCents,
          walletApplyCents: 0,
          zarCents,
        }),
      },
    });

    // Init accepted — repoint the invoice, guarded against a concurrent
    // fulfillment having marked it paid while we were talking to Paystack.
    const repointed = await db
      .update(schema.invoices)
      .set({ providerInvoiceId: reference, provider: "paystack" })
      .where(
        and(
          eq(schema.invoices.id, invoice.id),
          eq(schema.invoices.status, "open"),
        ),
      )
      .returning({ id: schema.invoices.id });
    if (repointed.length === 0) {
      // The invoice left "open" while we talked to Paystack — either a
      // concurrent payment landed or an admin voided it.
      throw createError({
        statusCode: 409,
        statusMessage:
          "This invoice can no longer be paid online. Refresh your account for its current status.",
      });
    }

    return {
      reference: result.reference,
      authorizationUrl: result.authorization_url,
      accessCode: result.access_code,
      usdCents,
      zarCents,
      walletAppliedCents: 0,
      publicKey: config.public?.paystackPublicKey || "",
    };
  } catch (err) {
    toSafeError(err, "account/resume-payment", "Could not resume payment.");
  }
});
