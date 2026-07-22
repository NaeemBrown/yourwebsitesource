import { and, eq } from "drizzle-orm";
import {
  RECURRING_STATUSES,
  type RecurringPatchPayload,
} from "../../models/admin";

/**
 * PATCH /api/admin/recurring — pause, resume, or cancel a recurring charge.
 * Resuming (active) clears any low-balance grace flag so it gets a clean run.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await readBody<RecurringPatchPayload>(event);

  if (!body?.id || !body?.status || !RECURRING_STATUSES.includes(body.status)) {
    throw createError({
      statusCode: 422,
      statusMessage:
        "A valid `id` and `status` (active/paused/canceled) are required.",
    });
  }

  const db = useDb();
  const [before] = await db
    .select()
    .from(schema.recurringCharges)
    .where(eq(schema.recurringCharges.id, body.id))
    .limit(1);
  if (!before) {
    throw createError({
      statusCode: 404,
      statusMessage: "Recurring charge not found.",
    });
  }

  // No-op transitions return unchanged: re-pausing a dunning-paused charge
  // would otherwise clear the dunning marker, converting it into an admin
  // pause that top-up recovery ignores — stranding the suspended site.
  if (before.status === body.status) {
    return { ok: true, recurringCharge: before };
  }

  const [row] = await db
    .update(schema.recurringCharges)
    .set({
      status: body.status,
      // A deliberate admin pause/cancel must clear the dunning marker —
      // recovery treats `paused` + lowBalanceNotifiedAt as an auto-pause and
      // would otherwise re-activate (and re-charge) this on the next top-up.
      // Resuming clears it too so the charge gets a clean grace run.
      lowBalanceNotifiedAt: null,
      ...(body.status === "active" ? { failureCount: 0 } : {}),
    })
    .where(eq(schema.recurringCharges.id, body.id))
    .returning();

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: "Recurring charge not found.",
    });
  }

  // Resuming a dunning-paused charge implies the account is squared away —
  // bring its suspended site back online too, or billing restarts for a site
  // that stays offline indefinitely.
  if (
    body.status === "active" &&
    before.status === "paused" &&
    before.lowBalanceNotifiedAt &&
    before.siteId
  ) {
    await db
      .update(schema.sites)
      .set({ status: "live", billingStatus: "current" })
      .where(
        and(
          eq(schema.sites.id, before.siteId),
          eq(schema.sites.status, "suspended"),
        ),
      );
  }

  await writeAudit(
    admin.email,
    "recurring.status",
    `${body.id} → ${body.status}`,
  );
  return { ok: true, recurringCharge: row };
});
