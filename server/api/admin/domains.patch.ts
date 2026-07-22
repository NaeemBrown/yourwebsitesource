import { and, eq } from "drizzle-orm";
import { MAX_RECURRING_MONTHLY_USD_CENTS } from "../../../shared/billing";
import type { DomainPatchPayload } from "../../models/admin";

/**
 * PATCH /api/admin/domains — edit a domain and keep its yearly renewal charge
 * in sync. Turning auto-renew on (with a cost + expiry) creates/updates the
 * domain recurring charge; turning it off (or clearing the cost) cancels it.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await readBody<DomainPatchPayload>(event);

  if (!body?.id) {
    throw createError({
      statusCode: 422,
      statusMessage: "An `id` is required.",
    });
  }

  const db = useDb();
  const [domain] = await db
    .select()
    .from(schema.domains)
    .where(eq(schema.domains.id, body.id))
    .limit(1);
  if (!domain) {
    throw createError({ statusCode: 404, statusMessage: "Domain not found." });
  }

  const domainUpdates: Partial<typeof schema.domains.$inferInsert> = {};

  // siteId: validate ownership, or detach with null.
  if (body.siteId !== undefined) {
    if (body.siteId === null) {
      domainUpdates.siteId = null;
    } else {
      const [site] = await db
        .select({ id: schema.sites.id })
        .from(schema.sites)
        .where(
          and(
            eq(schema.sites.id, body.siteId),
            eq(schema.sites.customerId, domain.customerId),
          ),
        )
        .limit(1);
      if (!site) {
        throw createError({
          statusCode: 422,
          statusMessage: "That site doesn't belong to this customer.",
        });
      }
      domainUpdates.siteId = site.id;
    }
  }

  if (body.registrar !== undefined)
    domainUpdates.registrar = body.registrar.trim() || "cloudflare";

  let expiresAt = domain.expiresAt ? new Date(domain.expiresAt) : null;
  if (body.expiresAt !== undefined) {
    const d = new Date(body.expiresAt);
    if (Number.isNaN(d.getTime())) {
      throw createError({ statusCode: 422, statusMessage: "Invalid expiry." });
    }
    expiresAt = d;
    domainUpdates.expiresAt = d.toISOString().slice(0, 10);
  }

  let annualCostCents = domain.annualCostCents;
  if (body.annualCostUsdCents !== undefined) {
    annualCostCents =
      body.annualCostUsdCents === null
        ? null
        : Math.round(body.annualCostUsdCents);
    if (
      annualCostCents != null &&
      (!Number.isFinite(annualCostCents) ||
        annualCostCents < 0 ||
        annualCostCents > MAX_RECURRING_MONTHLY_USD_CENTS)
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid annual cost.",
      });
    }
    domainUpdates.annualCostCents = annualCostCents;
  }

  let autoRenew = domain.autoRenew;
  if (body.autoRenew !== undefined) {
    autoRenew = body.autoRenew;
    domainUpdates.autoRenew = autoRenew;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(domainUpdates).length > 0) {
      await tx
        .update(schema.domains)
        .set(domainUpdates)
        .where(eq(schema.domains.id, domain.id));
    }

    const [existing] = await tx
      .select()
      .from(schema.recurringCharges)
      .where(
        and(
          eq(schema.recurringCharges.domainId, domain.id),
          eq(schema.recurringCharges.kind, "domain"),
        ),
      )
      .limit(1);

    const shouldBill = autoRenew && !!annualCostCents && annualCostCents > 0;

    // Only an explicit re-enable may reactivate a non-active charge — an
    // unrelated edit (attach a site, fix the registrar) must not resurrect
    // one the admin deliberately canceled/paused, and a dunning-paused charge
    // must restart with a clean grace state or the next failed debit would
    // skip the warning and suspend immediately. Re-adding a removed cost is
    // the same intent as re-enabling auto-renew (clearing the cost cancels
    // the charge, so re-adding it must be able to revive it).
    const reEnabled =
      (body.autoRenew === true && !domain.autoRenew) ||
      (body.annualCostUsdCents != null && domain.annualCostCents == null);

    if (shouldBill && expiresAt) {
      if (existing) {
        await tx
          .update(schema.recurringCharges)
          .set({
            amountCents: annualCostCents!,
            label: `${domain.fqdn} renewal`,
            interval: "year",
            // Re-anchor billing only when the admin actually set a new expiry
            // (post-registrar-renewal) or re-enabled auto-renew. The billing
            // task deliberately leaves `expiresAt` in the past after debiting
            // (the digest nags until the manual renewal), so re-anchoring on an
            // unrelated edit would rewind an already-billed charge and debit
            // the year twice. On a re-enable WITHOUT a new expiry, keep the
            // later of the two anchors for the same reason — the stale expiry
            // may describe a year the charge already collected.
            ...(body.expiresAt !== undefined
              ? { nextChargeAt: expiresAt }
              : reEnabled
                ? {
                    nextChargeAt:
                      expiresAt.getTime() > existing.nextChargeAt.getTime()
                        ? expiresAt
                        : existing.nextChargeAt,
                  }
                : {}),
            ...(existing.status !== "active" && reEnabled
              ? {
                  status: "active" as const,
                  lowBalanceNotifiedAt: null,
                  failureCount: 0,
                }
              : {}),
          })
          .where(eq(schema.recurringCharges.id, existing.id));
      } else {
        await tx.insert(schema.recurringCharges).values({
          customerId: domain.customerId,
          siteId: null,
          domainId: domain.id,
          kind: "domain",
          label: `${domain.fqdn} renewal`,
          amountCents: annualCostCents!,
          interval: "year",
          nextChargeAt: expiresAt,
        });
      }
    } else if (existing && existing.status !== "canceled") {
      // auto-renew turned off (or cost removed) — stop the renewal charge.
      await tx
        .update(schema.recurringCharges)
        .set({ status: "canceled" })
        .where(eq(schema.recurringCharges.id, existing.id));
    }
  });

  await writeAudit(admin.email, "domain.update", `${domain.id} ${domain.fqdn}`);

  const [updated] = await db
    .select()
    .from(schema.domains)
    .where(eq(schema.domains.id, domain.id))
    .limit(1);
  return { ok: true, domain: updated };
});
