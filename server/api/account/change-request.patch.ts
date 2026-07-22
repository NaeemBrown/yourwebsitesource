import { and, eq } from "drizzle-orm";

/**
 * PATCH /api/account/change-request — customer approves a quoted change request
 * and pays it from their wallet.
 *
 * Records consent (who/when), debits the wallet, and raises a paid `feature`
 * invoice — all atomically. The deterministic reference `twf_cr_<id>` plus the
 * for-update lock on the request make a double-click idempotent.
 */
export default defineEventHandler(async (event) => {
  const identity = await requireCustomer(event);
  const customer = await resolveCustomer(identity);
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: "Account not found." });
  }

  const body = await readBody<{ id?: string; action?: "approve" | "cancel" }>(
    event,
  );
  const id = body?.id?.trim();
  const action = body?.action ?? "approve";
  if (!id) {
    throw createError({
      statusCode: 422,
      statusMessage: "An `id` is required.",
    });
  }

  const db = useDb();

  // Cancel: a customer can withdraw a request they raised (e.g. by mistake)
  // while it's still open or quoted — never after it's approved/paid.
  if (action === "cancel") {
    const [cr] = await db
      .select()
      .from(schema.changeRequests)
      .where(
        and(
          eq(schema.changeRequests.id, id),
          eq(schema.changeRequests.customerId, customer.id),
        ),
      )
      .limit(1);
    if (!cr) {
      throw createError({
        statusCode: 404,
        statusMessage: "Request not found.",
      });
    }
    if (cr.status !== "open" && cr.status !== "quoted") {
      throw createError({
        statusCode: 409,
        statusMessage: "This request can no longer be cancelled.",
      });
    }
    await db
      .update(schema.changeRequests)
      .set({ status: "canceled" })
      .where(eq(schema.changeRequests.id, cr.id));
    return { ok: true, status: "canceled" };
  }

  const result = await db.transaction(async (tx) => {
    // Lock the request row so concurrent approvals serialise — the second one
    // sees status "approved" and bails.
    const [cr] = await tx
      .select()
      .from(schema.changeRequests)
      .where(
        and(
          eq(schema.changeRequests.id, id),
          eq(schema.changeRequests.customerId, customer.id),
        ),
      )
      .for("update")
      .limit(1);

    if (!cr) {
      throw createError({
        statusCode: 404,
        statusMessage: "Request not found.",
      });
    }
    if (cr.status !== "quoted" || !cr.quotedCents || cr.quotedCents <= 0) {
      throw createError({
        statusCode: 409,
        statusMessage: "This request isn't awaiting your approval.",
      });
    }

    const debit = await debitWallet({
      customerId: customer.id,
      type: "change",
      amountCents: cr.quotedCents,
      description: `Change request: ${cr.title}`,
      reference: `twf_cr_${cr.id}`,
      siteId: cr.siteId,
      createdBy: "system",
      tx,
    });
    if (!debit.ok) {
      throw createError({
        statusCode: 409,
        statusMessage: `Insufficient wallet balance — short ${(
          (debit.shortfallCents ?? 0) / 100
        ).toFixed(2)} USD. Please top up and try again.`,
      });
    }

    const [invoice] = await tx
      .insert(schema.invoices)
      .values({
        customerId: customer.id,
        siteId: cr.siteId,
        changeRequestId: cr.id,
        type: "feature",
        amountCents: cr.quotedCents,
        currency: "USD",
        status: "paid",
        provider: "wallet",
        paidAt: new Date(),
      })
      .returning({ id: schema.invoices.id });

    await tx
      .update(schema.changeRequests)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: customer.email,
        invoiceId: invoice?.id ?? null,
      })
      .where(eq(schema.changeRequests.id, cr.id));

    return {
      balanceAfterCents: debit.balanceAfterCents,
      invoiceId: invoice?.id,
      amountCents: cr.quotedCents,
      title: cr.title,
    };
  });

  // Notify both parties (best-effort, after the money has safely moved).
  if (customer.email) {
    const mail = changeApprovedEmail({
      name: customer.name,
      title: result.title,
      amountCents: result.amountCents,
      balanceAfterCents: result.balanceAfterCents,
    });
    void sendEmail({ to: customer.email, replyTo: getSupportEmail(), ...mail });
  }
  const adminInbox = getMailAdmin();
  if (adminInbox) {
    void sendEmail({
      to: adminInbox,
      replyTo: customer.email,
      subject: `Quote approved: ${customer.name} — ${result.title}`,
      html: `<p><strong>${esc(customer.name)}</strong> (${esc(customer.email)}) approved the quote for <strong>${esc(result.title)}</strong> (${(result.amountCents / 100).toFixed(2)} USD, paid from wallet). Time to start the work.</p>`,
      text: `${customer.name} (${customer.email}) approved the quote for "${result.title}" (${(result.amountCents / 100).toFixed(2)} USD, paid from wallet).`,
    });
  }

  return {
    ok: true,
    balanceAfterCents: result.balanceAfterCents,
    invoiceId: result.invoiceId,
  };
});
