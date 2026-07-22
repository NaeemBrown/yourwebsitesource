import { and, eq, isNull } from "drizzle-orm";
import {
  getRecurringService,
  MAX_RECURRING_MONTHLY_USD_CENTS,
  type RecurringKind,
} from "../../../shared/billing";
import type { RecurringPayload } from "../../models/admin";

/**
 * POST /api/admin/recurring (WebForgePlan2 §5)
 *
 * Attach a monthly recurring charge (hosting / database) to a customer — the
 * scheduled task debits it from their wallet. Either pass a catalogue `planKey`
 * or specify `kind` + `label` + `amountUsdCents` directly.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await readBody<RecurringPayload>(event);

  if (!body?.customerId) {
    throw createError({
      statusCode: 422,
      statusMessage: "`customerId` is required.",
    });
  }

  const db = useDb();

  // Confirm the target customer exists so an unknown/malformed id surfaces as a
  // clean 404 rather than a raw foreign-key violation.
  const [customer] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.id, body.customerId))
    .limit(1);
  if (!customer) {
    throw createError({
      statusCode: 404,
      statusMessage: "Customer not found.",
    });
  }

  let kind: RecurringKind;
  let label: string;
  let amountCents: number;
  let planKey: string | null = null;

  if (body.planKey) {
    const svc = getRecurringService(body.planKey);
    if (!svc) {
      throw createError({
        statusCode: 422,
        statusMessage: `Unknown service "${body.planKey}".`,
      });
    }
    kind = svc.kind;
    label = svc.label;
    amountCents = svc.amountUsdCents;
    planKey = svc.key;
  } else {
    if (!body.kind || !body.label || !body.amountUsdCents) {
      throw createError({
        statusCode: 422,
        statusMessage: "Provide a planKey, or kind + label + amountUsdCents.",
      });
    }
    // Validate before the insert so a bad kind is a clean 422 rather than a
    // raw Postgres enum error.
    if (!["hosting", "database"].includes(body.kind)) {
      // Domain renewals must be created via /admin/domains so they carry a
      // domainId — an unlinked one can't advance the domain record and shows
      // as a duplicate row in the customer's upcoming costs.
      throw createError({
        statusCode: 422,
        statusMessage:
          body.kind === "domain"
            ? "Create domain renewals from /admin/domains (set auto-renew + annual cost) so they're linked to the domain."
            : "`kind` must be hosting or database.",
      });
    }
    kind = body.kind;
    label = body.label.trim();
    amountCents = Math.round(body.amountUsdCents);
  }

  if (
    !Number.isFinite(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_RECURRING_MONTHLY_USD_CENTS
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: `Amount must be positive and at most $${(
        MAX_RECURRING_MONTHLY_USD_CENTS / 100
      ).toLocaleString("en-US")}/mo.`,
    });
  }

  // Without an explicit nextChargeAt, the admin chooses: first month free
  // (billing starts one interval out, nothing debited today) or charge the
  // wallet right now for the first interval. Either way the follow-up charge
  // lands one interval from today.
  const now = new Date();
  const chargeNow = !body.nextChargeAt && body.firstMonthFree !== true;
  const nextChargeAt = body.nextChargeAt
    ? new Date(body.nextChargeAt)
    : addMonthsClamped(now, 1);
  if (Number.isNaN(nextChargeAt.getTime())) {
    throw createError({
      statusCode: 422,
      statusMessage: "Invalid nextChargeAt date.",
    });
  }

  // A supplied siteId must belong to the target customer — otherwise the charge
  // would be attributed to another customer's site (data-integrity corruption).
  let siteId: string | null = null;
  if (body.siteId) {
    const [site] = await db
      .select({ id: schema.sites.id })
      .from(schema.sites)
      .where(
        and(
          eq(schema.sites.id, body.siteId),
          eq(schema.sites.customerId, body.customerId),
        ),
      )
      .limit(1);
    if (!site) {
      throw createError({
        statusCode: 422,
        statusMessage: "That site doesn't belong to this customer.",
      });
    }
    siteId = site.id;
  }

  // Reject a duplicate ACTIVE charge for the same customer/site/kind — the
  // billing task would otherwise debit both and double-charge the customer.
  // (A partial unique index backstops this for non-null sites; the explicit
  // check also covers the null-siteId case, where SQL unique treats NULLs as
  // distinct.)
  const [duplicate] = await db
    .select({ id: schema.recurringCharges.id })
    .from(schema.recurringCharges)
    .where(
      and(
        eq(schema.recurringCharges.customerId, body.customerId),
        eq(schema.recurringCharges.kind, kind),
        eq(schema.recurringCharges.status, "active"),
        siteId
          ? eq(schema.recurringCharges.siteId, siteId)
          : isNull(schema.recurringCharges.siteId),
      ),
    )
    .limit(1);
  if (duplicate) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "An active charge of this kind already exists for this customer/site.",
    });
  }

  // Create the charge and (unless the first month is free) debit the wallet
  // for the first interval in the same transaction — a failed debit rolls the
  // whole thing back so we never leave a charge that looks already-billed.
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.recurringCharges)
      .values({
        customerId: body.customerId!,
        siteId,
        kind,
        planKey,
        label,
        amountCents,
        // Domain renewals bill yearly — a monthly interval would debit the
        // annual fee every month.
        interval: kind === "domain" ? "year" : "month",
        nextChargeAt,
        ...(chargeNow ? { lastChargedAt: now } : {}),
      })
      .returning();
    if (!created) {
      throw createError({
        statusCode: 500,
        statusMessage: "Could not create the recurring charge.",
      });
    }

    if (chargeNow) {
      const debit = await debitWallet({
        customerId: body.customerId!,
        type: kind,
        amountCents,
        description: `${label} (first month)`,
        siteId,
        createdBy: admin.email,
        tx,
      });
      if (!debit.ok) {
        throw createError({
          statusCode: 409,
          statusMessage: `Wallet is short $${((debit.shortfallCents ?? 0) / 100).toFixed(2)} for the first month — credit it first, or tick "First month free".`,
        });
      }
      await tx.insert(schema.invoices).values({
        customerId: body.customerId!,
        siteId,
        recurringChargeId: created.id,
        type: kind === "database" ? "database" : "hosting",
        amountCents,
        currency: "USD",
        status: "paid",
        provider: "wallet",
        paidAt: now,
      });
    }

    return created;
  });

  await writeAudit(
    admin.email,
    "recurring.create",
    `customer:${body.customerId} ${label} ${amountCents}c/mo${
      chargeNow
        ? " (first month charged)"
        : body.nextChargeAt
          ? ""
          : " (first month free)"
    }`,
  );

  return { ok: true, recurringCharge: row };
});
