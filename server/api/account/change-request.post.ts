import { and, eq } from "drizzle-orm";
import { isUuid } from "~~/shared/validation";
import type { ChangeRequestPayload } from "../../models/account";

/**
 * POST /api/account/change-request (WebForgePlan2 §4.5)
 *
 * A signed-in customer submits a change/feature request. Stored as a
 * `change_requests` row; an admin later scopes + quotes it and debits the
 * wallet. Also alerts the admin inbox.
 */
export default defineEventHandler(async (event) => {
  const identity = await requireCustomer(event);
  const customer = await resolveCustomer(identity, { createIfMissing: true });
  if (!customer) {
    throw createError({
      statusCode: 404,
      statusMessage: "No customer record.",
    });
  }

  const body = await readBody<ChangeRequestPayload>(event);
  const title = body?.title?.trim() ?? "";
  const details = body?.details?.trim() ?? "";

  if (title.length < 3 || details.length < 10) {
    throw createError({
      statusCode: 422,
      statusMessage: "Please give a short title and a few sentences of detail.",
    });
  }
  if (title.length > 200) {
    throw createError({
      statusCode: 422,
      statusMessage: "Please keep the title under 200 characters.",
    });
  }
  if (details.length > 5000) {
    throw createError({
      statusCode: 422,
      statusMessage: "Please keep the details under 5,000 characters.",
    });
  }

  // A change request must target one of the customer's sites — there's nothing
  // to change without a site we built/host for them.
  if (!body?.siteId || !isUuid(body.siteId)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Please choose which site this change is for.",
    });
  }

  const db = useDb();

  // Validate site ownership: a customer may only attach a request to their own
  // site. Without this, a signed-in user could reference another customer's
  // siteId (horizontal privilege escalation / data-integrity corruption).
  const [site] = await db
    .select({ id: schema.sites.id })
    .from(schema.sites)
    .where(
      and(
        eq(schema.sites.id, body.siteId),
        eq(schema.sites.customerId, customer.id),
      ),
    )
    .limit(1);
  if (!site) {
    throw createError({
      statusCode: 403,
      statusMessage: "That site doesn't belong to your account.",
    });
  }
  const siteId = site.id;

  const [row] = await db
    .insert(schema.changeRequests)
    .values({
      customerId: customer.id,
      siteId,
      title,
      details,
    })
    .returning({ id: schema.changeRequests.id });

  // Alert the admin inbox (best-effort; never blocks the response).
  const admin = getMailAdmin();
  if (admin) {
    // Strip CR/LF from the subject (header-injection guard) and escape every
    // user-supplied value before interpolating it into the HTML body (XSS guard).
    const safeSubjectTitle = title.replace(/[\r\n]+/g, " ");
    void sendEmail({
      to: admin,
      replyTo: customer.email,
      subject: `Change request from ${customer.name}: ${safeSubjectTitle}`,
      html: `<p><strong>${esc(customer.name)}</strong> (${esc(customer.email)}) submitted a change request.</p><p><strong>${esc(title)}</strong></p><p style="white-space:pre-wrap">${esc(details)}</p>`,
      text: `${customer.name} (${customer.email}) submitted a change request.\n\n${title}\n\n${details}`,
    });
  }

  return { ok: true, id: row?.id };
});
