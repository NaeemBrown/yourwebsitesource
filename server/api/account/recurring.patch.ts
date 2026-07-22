import { and, eq } from "drizzle-orm";
import { isUuid } from "~~/shared/validation";

/**
 * PATCH /api/account/recurring — a signed-in customer cancels one of their OWN
 * recurring services. The service stays paid through `nextChargeAt` (billing
 * is prepaid), so we simply stop future charges. Confirmation goes to the
 * customer; the admin inbox is alerted so the underlying service is actually
 * wound down.
 */
export default defineEventHandler(async (event) => {
  const identity = await requireCustomer(event);
  const customer = await resolveCustomer(identity);
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: "Account not found." });
  }

  const body = await readBody<{ id?: string }>(event);
  if (!body?.id || !isUuid(body.id)) {
    throw createError({
      statusCode: 422,
      statusMessage: "A valid `id` is required.",
    });
  }

  const db = useDb();
  const [charge] = await db
    .select()
    .from(schema.recurringCharges)
    .where(
      and(
        eq(schema.recurringCharges.id, body.id),
        eq(schema.recurringCharges.customerId, customer.id),
      ),
    )
    .limit(1);

  if (!charge) {
    throw createError({ statusCode: 404, statusMessage: "Service not found." });
  }
  if (charge.status === "canceled") {
    return { ok: true, recurringCharge: charge };
  }

  const [updated] = await db
    .update(schema.recurringCharges)
    .set({ status: "canceled", lowBalanceNotifiedAt: null })
    .where(eq(schema.recurringCharges.id, charge.id))
    .returning();

  // Paid-through date: the next charge date they will now never be billed for.
  const paidThrough = charge.status === "active" ? charge.nextChargeAt : null;

  if (customer.email) {
    const mail = serviceCanceledEmail({
      name: customer.name,
      serviceLabel: charge.label,
      paidThrough,
    });
    void sendEmail({ to: customer.email, replyTo: getSupportEmail(), ...mail });
  }
  const adminInbox = getMailAdmin();
  if (adminInbox) {
    void sendEmail({
      to: adminInbox,
      replyTo: customer.email,
      subject: `Service canceled by customer: ${customer.name} — ${charge.label}`,
      html: `<p><strong>${esc(customer.name)}</strong> (${esc(customer.email)}) canceled <strong>${esc(charge.label)}</strong> (${(charge.amountCents / 100).toFixed(2)} USD/${charge.interval}). Wind down the underlying service${paidThrough ? ` after ${new Date(paidThrough).toDateString()}` : ""}.</p>`,
      text: `${customer.name} (${customer.email}) canceled ${charge.label}. Wind down the underlying service${paidThrough ? ` after ${new Date(paidThrough).toDateString()}` : ""}.`,
    });
  }

  return { ok: true, recurringCharge: updated };
});
