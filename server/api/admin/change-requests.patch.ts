import { and, eq, inArray } from "drizzle-orm";
import { MAX_RECURRING_MONTHLY_USD_CENTS } from "../../../shared/billing";
import {
  CHANGE_REQUEST_ADMIN_STATUSES,
  type ChangeRequestPatchPayload,
} from "../../models/admin";

/**
 * PATCH /api/admin/change-requests — quote, decline, or mark a request done.
 *
 * Quoting sets the amount the customer will approve + pay from their wallet
 * (the customer endpoint does the actual debit on approval).
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await readBody<ChangeRequestPatchPayload>(event);

  if (!body?.id || !body?.status) {
    throw createError({
      statusCode: 422,
      statusMessage: "An `id` and `status` are required.",
    });
  }
  if (!CHANGE_REQUEST_ADMIN_STATUSES.includes(body.status)) {
    throw createError({ statusCode: 422, statusMessage: "Invalid status." });
  }

  const updates: Partial<typeof schema.changeRequests.$inferInsert> = {
    status: body.status,
  };

  if (body.status === "quoted") {
    const cents = Math.round(body.quotedUsdCents ?? 0);
    if (
      !Number.isFinite(cents) ||
      cents <= 0 ||
      cents > MAX_RECURRING_MONTHLY_USD_CENTS
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "A valid quote amount is required to quote a request.",
      });
    }
    updates.quotedCents = cents;
  }

  const db = useDb();

  // Every transition is conditional on the current status — otherwise an admin
  // acting on a stale page racing a customer approval could silently flip a
  // PAID request back to `quoted` (or to `declined`, taking the money with no
  // work recorded). `done` only ever follows a paid approval.
  const allowedFrom: Record<string, ("open" | "quoted" | "declined" | "approved")[]> = {
    quoted: ["open", "quoted", "declined"],
    declined: ["open", "quoted"],
    done: ["approved"],
  };

  const [row] = await db
    .update(schema.changeRequests)
    .set(updates)
    .where(
      and(
        eq(schema.changeRequests.id, body.id),
        inArray(schema.changeRequests.status, allowedFrom[body.status] ?? []),
      ),
    )
    .returning();

  if (!row) {
    const [exists] = await db
      .select({ status: schema.changeRequests.status })
      .from(schema.changeRequests)
      .where(eq(schema.changeRequests.id, body.id))
      .limit(1);
    if (exists) {
      throw createError({
        statusCode: 409,
        statusMessage: `Can't set a request that is already ${exists.status} to ${body.status}. Refresh first.`,
      });
    }
    throw createError({ statusCode: 404, statusMessage: "Request not found." });
  }

  // Email the customer their quote with a review-and-approve link.
  if (body.status === "quoted" && updates.quotedCents) {
    const [customer] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, row.customerId))
      .limit(1);
    if (customer?.email) {
      const base = process.env.NUXT_PUBLIC_SITE_URL;
      const mail = changeQuoteEmail({
        name: customer.name,
        title: row.title,
        quotedCents: updates.quotedCents,
        accountUrl: base ? `${base.replace(/\/$/, "")}/account` : null,
      });
      void sendEmail({
        to: customer.email,
        replyTo: getSupportEmail(),
        ...mail,
      });
    }
  }

  await writeAudit(
    admin.email,
    `change_request.${body.status}`,
    `${body.id}${updates.quotedCents ? ` ${updates.quotedCents}c` : ""}`,
  );
  return { ok: true, request: row };
});
