import { and, eq, lte } from "drizzle-orm";
import { useDb, schema } from "../../utils/db";
import { debitWallet } from "../../utils/wallet";
import { sendEmail, getSupportEmail, getMailAdmin } from "../../utils/email";
import {
  lowBalanceEmail,
  suspensionEmail,
  adminOverdueAlertEmail,
} from "../../utils/email-templates";
import { nextChargeAfter } from "../../utils/billing-cycle";

/**
 * Scheduled task: debit due recurring charges from customer wallets
 * (WebForgePlan2 §4.4). Configured in nuxt.config.ts to run daily at 06:00.
 *
 * Charges bill on their `interval`: hosting/database monthly, domains yearly.
 * For each active charge whose `next_charge_at` is due:
 *  - If the wallet covers it → debit, raise a paid invoice, advance the date one
 *    interval, and (for domains) advance the domain expiry. All in one tx.
 *  - If not → start (or continue) a grace window. On first miss, email a
 *    low-balance warning. After GRACE_DAYS still unpaid, suspend the site and
 *    pause the charge.
 *
 * Idempotency: we only debit charges that are due, and advancing
 * `next_charge_at` in the same pass prevents a same-day re-run from
 * double-charging.
 */

const GRACE_DAYS = 10;

/** Thrown inside the charge transaction to roll back when the wallet is short. */
class InsufficientFundsError extends Error {
  constructor(readonly balanceAfterCents: number) {
    super("insufficient_funds");
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function topupUrl(): string | null {
  const base = process.env.NUXT_PUBLIC_SITE_URL;
  return base ? `${base.replace(/\/$/, "")}/account` : null;
}

/** Invoice type for a recurring charge kind. */
function invoiceTypeFor(kind: string): "hosting" | "database" | "domain" {
  if (kind === "domain") return "domain";
  if (kind === "database") return "database";
  return "hosting";
}

export default defineTask({
  meta: {
    name: "billing:charge-recurring",
    description: "Debit due recurring charges from customer wallets.",
  },
  async run() {
    const db = useDb();
    const now = new Date();

    const due = await db
      .select()
      .from(schema.recurringCharges)
      .where(
        and(
          eq(schema.recurringCharges.status, "active"),
          lte(schema.recurringCharges.nextChargeAt, now),
        ),
      );

    let charged = 0;
    let lowBalance = 0;
    let suspended = 0;
    let failed = 0;

    for (const rc of due) {
      // Isolate each charge: a thrown error (transient DB issue, lock timeout,
      // etc.) on one row must not abort the whole run and skip every charge
      // behind it. Count the failure and move on.
      try {
        const [customer] = await db
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.id, rc.customerId))
          .limit(1);
        if (!customer) continue;

        const advanced =
          rc.interval === "year"
            ? addYears(rc.nextChargeAt, 1)
            : addMonths(rc.nextChargeAt, 1);

        // Debit + paid invoice + date advance (+ domain expiry) commit together.
        // An insufficient balance throws the sentinel to roll the whole thing
        // back, so we never raise an invoice without a matching wallet debit.
        let balanceAfterCents = 0;
        try {
          await db.transaction(async (tx) => {
            const result = await debitWallet({
              customerId: rc.customerId,
              type: rc.kind,
              amountCents: rc.amountCents,
              description: rc.label,
              siteId: rc.siteId,
              createdBy: "system",
              tx,
            });
            if (!result.ok) {
              throw new InsufficientFundsError(result.balanceAfterCents);
            }
            balanceAfterCents = result.balanceAfterCents;

            await tx.insert(schema.invoices).values({
              customerId: rc.customerId,
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

            // Domain renewal: push the registration expiry out one year too.
            if (rc.kind === "domain" && rc.domainId) {
              await tx
                .update(schema.domains)
                .set({ expiresAt: advanced.toISOString().slice(0, 10) })
                .where(eq(schema.domains.id, rc.domainId));
            }

            // A successful charge clears any prior billing-grace flag on the site.
            if (rc.siteId) {
              await tx
                .update(schema.sites)
                .set({ billingStatus: "current" })
                .where(eq(schema.sites.id, rc.siteId));
            }

            // nextChargeAfter always lands strictly in the future — a stale
            // anchor (pause/resume, downtime) can never cause a re-charge on
            // every subsequent daily run.
            await tx
              .update(schema.recurringCharges)
              .set({
                nextChargeAt: nextChargeAfter(
                  rc.nextChargeAt,
                  rc.interval,
                  now,
                ),
                lowBalanceNotifiedAt: null,
                lastChargedAt: now,
                failureCount: 0,
              })
              .where(eq(schema.recurringCharges.id, rc.id));
          });
          charged++;
          continue;
        } catch (txErr) {
          if (!(txErr instanceof InsufficientFundsError)) throw txErr;
          balanceAfterCents = txErr.balanceAfterCents;
          // fall through to grace handling below
        }

        // ---- Insufficient balance ----
        if (!rc.lowBalanceNotifiedAt) {
          // First miss → open the grace window and warn.
          await db
            .update(schema.recurringCharges)
            .set({
              lowBalanceNotifiedAt: now,
              failureCount: rc.failureCount + 1,
            })
            .where(eq(schema.recurringCharges.id, rc.id));
          lowBalance++;
          if (customer.email) {
            const mail = lowBalanceEmail({
              name: customer.name,
              balanceCents: balanceAfterCents,
              serviceLabel: rc.label,
              chargeCents: rc.amountCents,
              graceDays: GRACE_DAYS,
              topupUrl: topupUrl(),
            });
            void sendEmail({
              to: customer.email,
              replyTo: getSupportEmail(),
              ...mail,
            });
          }
          const adminInbox = getMailAdmin();
          if (adminInbox) {
            const alert = adminOverdueAlertEmail({
              customerName: customer.name,
              customerEmail: customer.email,
              serviceLabel: rc.label,
              balanceCents: balanceAfterCents,
              chargeCents: rc.amountCents,
              stage: "grace",
              graceDays: GRACE_DAYS,
            });
            void sendEmail({ to: adminInbox, ...alert });
          }
          continue;
        }

        // Already in grace — has it expired?
        const graceMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
        const graceExpired =
          now.getTime() - new Date(rc.lowBalanceNotifiedAt).getTime() >=
          graceMs;

        if (graceExpired) {
          // Suspend the linked site (if any) and pause the charge.
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
              .set({ status: "suspended", billingStatus: "suspended" })
              .where(eq(schema.sites.id, rc.siteId));
          }
          await db
            .update(schema.recurringCharges)
            .set({ status: "paused", failureCount: rc.failureCount + 1 })
            .where(eq(schema.recurringCharges.id, rc.id));
          suspended++;
          if (customer.email) {
            const mail = suspensionEmail({
              name: customer.name,
              siteName,
              topupUrl: topupUrl(),
            });
            void sendEmail({
              to: customer.email,
              replyTo: getSupportEmail(),
              ...mail,
            });
          }
          const adminInbox = getMailAdmin();
          if (adminInbox) {
            const alert = adminOverdueAlertEmail({
              customerName: customer.name,
              customerEmail: customer.email,
              serviceLabel: rc.label,
              balanceCents: balanceAfterCents,
              chargeCents: rc.amountCents,
              stage: "suspended",
              siteName,
            });
            void sendEmail({ to: adminInbox, ...alert });
          }
        } else {
          // Still within grace — flag the continued shortfall as a billing
          // grace state on the site so the admin/customer can see it.
          await db
            .update(schema.recurringCharges)
            .set({ failureCount: rc.failureCount + 1 })
            .where(eq(schema.recurringCharges.id, rc.id));
          if (rc.siteId) {
            await db
              .update(schema.sites)
              .set({ billingStatus: "grace" })
              .where(eq(schema.sites.id, rc.siteId));
          }
        }
      } catch (err) {
        failed++;
        console.error(
          `[billing:charge-recurring] charge ${rc.id} (customer ${rc.customerId}) failed:`,
          err,
        );
      }
    }

    const summary = `charged=${charged} lowBalance=${lowBalance} suspended=${suspended} failed=${failed} due=${due.length}`;
    console.info(`[billing:charge-recurring] ${summary}`);
    return { result: summary };
  },
});
