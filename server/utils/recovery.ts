import { and, eq, isNotNull } from "drizzle-orm";
import { useDb, schema } from "./db";
import { debitWallet } from "./wallet";
import { nextChargeAfter } from "./billing-cycle";
import { sendEmail, getSupportEmail, getMailAdmin } from "./email";
import { serviceRestoredEmail, esc } from "./email-templates";

/**
 * After a wallet credit lands (Paystack top-up or admin/EFT credit), try to
 * recover services that were auto-paused for non-payment: charge the missed
 * amount, raise the matching paid invoice, resume billing on a fresh anchor
 * (never back-billing suspended time), and restore any suspended site.
 *
 * Only charges paused with `low_balance_notified_at` set are touched — that
 * flag marks a dunning pause; charges an admin paused deliberately have it
 * cleared and are left alone.
 */

/** Invoice type for a recurring charge kind (mirrors charge-recurring). */
function invoiceTypeFor(kind: string): "hosting" | "database" | "domain" {
  if (kind === "domain") return "domain";
  if (kind === "database") return "database";
  return "hosting";
}

export async function recoverSuspendedServices(customerId: string): Promise<{
  restored: number;
}> {
  const db = useDb();
  const now = new Date();

  const paused = await db
    .select()
    .from(schema.recurringCharges)
    .where(
      and(
        eq(schema.recurringCharges.customerId, customerId),
        eq(schema.recurringCharges.status, "paused"),
        isNotNull(schema.recurringCharges.lowBalanceNotifiedAt),
      ),
    );

  let restored = 0;

  for (const rc of paused) {
    // Atomically CLAIM the resume (status must still be `paused`) BEFORE
    // debiting — two concurrent credits (e.g. webhook top-up + admin EFT)
    // would otherwise both re-charge the same missed service.
    const [claimed] = await db
      .update(schema.recurringCharges)
      .set({
        status: "active",
        lowBalanceNotifiedAt: null,
        nextChargeAt: nextChargeAfter(now, rc.interval, now),
        lastChargedAt: now,
        failureCount: 0,
      })
      .where(
        and(
          eq(schema.recurringCharges.id, rc.id),
          eq(schema.recurringCharges.status, "paused"),
        ),
      )
      .returning();
    if (!claimed) continue; // another credit already recovered it

    // Debit + paid invoice commit together, mirroring the scheduled task.
    let debitOk = false;
    try {
      await db.transaction(async (tx) => {
        const debit = await debitWallet({
          customerId,
          type: rc.kind,
          amountCents: rc.amountCents,
          description: `${rc.label} (service restored)`,
          siteId: rc.siteId,
          createdBy: "system",
          tx,
        });
        if (!debit.ok) throw new Error("insufficient_funds");

        await tx.insert(schema.invoices).values({
          customerId,
          siteId: rc.siteId,
          recurringChargeId: rc.id,
          domainId: rc.domainId ?? null,
          type: invoiceTypeFor(rc.kind),
          amountCents: rc.amountCents,
          currency: "USD",
          status: "paid",
          provider: "wallet",
          paidAt: now,
        });
        debitOk = true;
      });
    } catch {
      debitOk = false;
    }

    if (!debitOk) {
      // Still short — release the claim back to its dunning-paused state.
      await db
        .update(schema.recurringCharges)
        .set({
          status: "paused",
          lowBalanceNotifiedAt: rc.lowBalanceNotifiedAt,
          nextChargeAt: rc.nextChargeAt,
          lastChargedAt: rc.lastChargedAt,
          failureCount: rc.failureCount,
        })
        .where(eq(schema.recurringCharges.id, rc.id));
      continue;
    }
    restored++;

    // Bring a suspended site back online.
    let siteName: string | null = null;
    if (rc.siteId) {
      const [site] = await db
        .select()
        .from(schema.sites)
        .where(eq(schema.sites.id, rc.siteId))
        .limit(1);
      siteName = site?.name ?? null;
      await db
        .update(schema.sites)
        .set({
          ...(site?.status === "suspended" ? { status: "live" as const } : {}),
          billingStatus: "current",
        })
        .where(eq(schema.sites.id, rc.siteId));
    }

    const [customer] = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .limit(1);
    if (customer?.email) {
      const mail = serviceRestoredEmail({ name: customer.name, siteName });
      void sendEmail({
        to: customer.email,
        replyTo: getSupportEmail(),
        ...mail,
      });
    }
    const admin = getMailAdmin();
    if (admin && customer) {
      void sendEmail({
        to: admin,
        subject: `Restored: ${customer.name} — ${rc.label}`,
        html: `<p>${esc(customer.name)} (${esc(customer.email)}) topped up. ${esc(rc.label)} was charged and resumed${siteName ? `, and ${esc(siteName)} was set back to live` : ""}.</p>`,
        text: `${customer.name} (${customer.email}) topped up. ${rc.label} was charged and resumed${siteName ? `, and ${siteName} was set back to live` : ""}.`,
      });
    }
  }

  return { restored };
}
