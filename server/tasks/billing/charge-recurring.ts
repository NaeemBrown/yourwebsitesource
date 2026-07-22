import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
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
 *  - If the wallet covers it → debit, raise a paid invoice, and advance the
 *    date one interval. All in one tx. (Domain registrations are renewed
 *    MANUALLY at the registrar — the weekly expiry digest reminds the admin,
 *    who updates `domains.expiresAt` in /admin/domains after renewing. The
 *    task deliberately does NOT advance the expiry: doing so at debit time
 *    would hide the domain from the digest before anyone renewed it.)
 *  - If not → start (or continue) a grace window. On first miss, email a
 *    low-balance warning. After GRACE_DAYS still unpaid, suspend the site and
 *    pause the charge.
 *
 * Idempotency: every debit re-checks due-ness under a row lock inside its
 * transaction, so overlapping runs (manual trigger during the cron, or two
 * instances of the app) can't double-charge; the grace/suspend transitions
 * are compare-and-set claims for the same reason.
 */

const GRACE_DAYS = 10;

/** Thrown inside the charge transaction to roll back when the wallet is short. */
class InsufficientFundsError extends Error {
  constructor(readonly balanceAfterCents: number) {
    super("insufficient_funds");
  }
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

        // Debit + paid invoice + date advance commit together. An insufficient
        // balance throws the sentinel to roll the whole thing back, so we never
        // raise an invoice without a matching wallet debit.
        let balanceAfterCents = 0;
        let fresh = rc;
        let claimed = true;
        try {
          await db.transaction(async (tx) => {
            // Lock the row and re-check due-ness: a concurrent run that
            // already debited it has advanced next_charge_at, so the loser
            // sees a future date here and skips instead of double-charging.
            const [locked] = await tx
              .select()
              .from(schema.recurringCharges)
              .where(eq(schema.recurringCharges.id, rc.id))
              .for("update")
              .limit(1);
            if (
              !locked ||
              locked.status !== "active" ||
              locked.nextChargeAt.getTime() > now.getTime()
            ) {
              claimed = false;
              return;
            }
            fresh = locked;

            const result = await debitWallet({
              customerId: fresh.customerId,
              type: fresh.kind,
              amountCents: fresh.amountCents,
              description: fresh.label,
              siteId: fresh.siteId,
              createdBy: "system",
              tx,
            });
            if (!result.ok) {
              throw new InsufficientFundsError(result.balanceAfterCents);
            }
            balanceAfterCents = result.balanceAfterCents;

            await tx.insert(schema.invoices).values({
              customerId: fresh.customerId,
              siteId: fresh.siteId,
              recurringChargeId: fresh.id,
              domainId: fresh.domainId ?? null,
              type: invoiceTypeFor(fresh.kind),
              amountCents: fresh.amountCents,
              currency: "USD",
              status: "paid",
              provider: "wallet",
              paidAt: now,
            });

            // A successful charge clears any prior billing-grace flag on the site.
            if (fresh.siteId) {
              await tx
                .update(schema.sites)
                .set({ billingStatus: "current" })
                .where(eq(schema.sites.id, fresh.siteId));
            }

            // nextChargeAfter always lands strictly in the future — a stale
            // anchor (pause/resume, downtime) can never cause a re-charge on
            // every subsequent daily run.
            await tx
              .update(schema.recurringCharges)
              .set({
                nextChargeAt: nextChargeAfter(
                  fresh.nextChargeAt,
                  fresh.interval,
                  now,
                ),
                lowBalanceNotifiedAt: null,
                lastChargedAt: now,
                failureCount: 0,
              })
              .where(eq(schema.recurringCharges.id, fresh.id));
          });
          if (!claimed) continue;
          charged++;
          continue;
        } catch (txErr) {
          if (!(txErr instanceof InsufficientFundsError)) throw txErr;
          balanceAfterCents = txErr.balanceAfterCents;
          // fall through to grace handling below
        }

        // ---- Insufficient balance ----
        if (!fresh.lowBalanceNotifiedAt) {
          // First miss → open the grace window and warn. Compare-and-set so a
          // concurrent run can't open it twice and double-send the warning.
          const opened = await db
            .update(schema.recurringCharges)
            .set({
              lowBalanceNotifiedAt: now,
              failureCount: fresh.failureCount + 1,
            })
            .where(
              and(
                eq(schema.recurringCharges.id, fresh.id),
                eq(schema.recurringCharges.status, "active"),
                isNull(schema.recurringCharges.lowBalanceNotifiedAt),
              ),
            )
            .returning({ id: schema.recurringCharges.id });
          if (opened.length === 0) continue;
          lowBalance++;
          if (customer.email) {
            const mail = lowBalanceEmail({
              name: customer.name,
              balanceCents: balanceAfterCents,
              serviceLabel: fresh.label,
              chargeCents: fresh.amountCents,
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
              serviceLabel: fresh.label,
              balanceCents: balanceAfterCents,
              chargeCents: fresh.amountCents,
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
          now.getTime() - new Date(fresh.lowBalanceNotifiedAt).getTime() >=
          graceMs;

        if (graceExpired) {
          // Pause the charge first as a compare-and-set claim — only the run
          // that wins it suspends the site and sends the emails.
          const paused = await db
            .update(schema.recurringCharges)
            .set({ status: "paused", failureCount: fresh.failureCount + 1 })
            .where(
              and(
                eq(schema.recurringCharges.id, fresh.id),
                eq(schema.recurringCharges.status, "active"),
                isNotNull(schema.recurringCharges.lowBalanceNotifiedAt),
              ),
            )
            .returning({ id: schema.recurringCharges.id });
          if (paused.length === 0) continue;

          // Suspend the linked site (if any).
          let siteName: string | null = null;
          if (fresh.siteId) {
            const [site] = await db
              .select()
              .from(schema.sites)
              .where(eq(schema.sites.id, fresh.siteId))
              .limit(1);
            siteName = site?.name ?? null;
            await db
              .update(schema.sites)
              .set({ status: "suspended", billingStatus: "suspended" })
              .where(eq(schema.sites.id, fresh.siteId));
          }
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
              serviceLabel: fresh.label,
              balanceCents: balanceAfterCents,
              chargeCents: fresh.amountCents,
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
            .set({ failureCount: fresh.failureCount + 1 })
            .where(eq(schema.recurringCharges.id, fresh.id));
          if (fresh.siteId) {
            await db
              .update(schema.sites)
              .set({ billingStatus: "grace" })
              .where(eq(schema.sites.id, fresh.siteId));
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
