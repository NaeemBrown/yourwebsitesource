import { eq } from "drizzle-orm";
import { recoverSuspendedServices } from "./recovery";

/** Internal sentinel: thrown to roll back a build transaction when the wallet
 * debit comes up short, without surfacing as a generic 500. */
class WalletInsufficientError extends Error {
  constructor(readonly shortfallCents: number) {
    super("wallet_insufficient");
  }
}

/**
 * Shared payment fulfillment (WebForgePlan2 §4.3/§4.6).
 *
 * The single place that turns a *successful* Paystack transaction into value:
 *  - top-up  → credit the customer's wallet (USD), email a receipt
 *  - build   → mark the matching one-off invoice paid, email a receipt
 *
 * Called from BOTH the webhook (`charge.success`) and the checkout-verify step
 * (the success page). Either path can fulfill, so a top-up still completes even
 * if the webhook is delayed or not configured. Idempotent on the Paystack
 * `reference` — running twice never double-credits (guarded by the
 * `wallet_transactions.reference` unique index + a pre-check, and by the
 * invoice's `paid` status for builds).
 *
 * Always re-verifies with Paystack first — never trusts a redirect or an
 * unverified event payload.
 */

export interface FinalizeResult {
  ok: boolean;
  status: string; // "success" | "failed" | "abandoned" | "verify_failed" | ...
  kind?: "topup" | "build";
  balanceAfterCents?: number;
}

export async function finalizeByReference(
  reference: string,
): Promise<FinalizeResult> {
  let verified;
  try {
    verified = await verifyTransaction(reference);
  } catch (err) {
    console.error(`[fulfillment] verify failed for ${reference}:`, err);
    return { ok: false, status: "verify_failed" };
  }

  if (verified.status !== "success") {
    return { ok: false, status: verified.status };
  }

  const meta = (verified.metadata ?? {}) as Record<string, unknown>;
  const purpose = typeof meta.purpose === "string" ? meta.purpose : undefined;

  if (purpose === "topup" || reference.startsWith("twf_topup")) {
    return finalizeTopup(reference, verified, meta);
  }
  return finalizeBuild(reference, verified, meta);
}

/* ------------------------------- top-up -------------------------------- */

async function finalizeTopup(
  reference: string,
  verified: {
    amount: number;
    currency?: string;
    customer?: { email?: string; customer_code?: string };
  },
  meta: Record<string, unknown>,
): Promise<FinalizeResult> {
  // Idempotency pre-check (the unique index is the hard guarantee).
  if (await walletHasReference(reference)) {
    return { ok: true, status: "success", kind: "topup" };
  }

  const customerId =
    typeof meta.customerId === "string" ? meta.customerId : undefined;
  const usdCents = Number(meta.usdCents ?? 0);
  if (!customerId || !Number.isFinite(usdCents) || usdCents <= 0) {
    console.warn(
      `[fulfillment] topup ${reference} missing customerId/usdCents metadata.`,
    );
    return { ok: false, status: "missing_metadata" };
  }

  // Metadata is only trustworthy if WE initialised the transaction: anyone
  // holding the public key can create one with arbitrary usdCents/customerId.
  // The HMAC (minted at init) proves the amounts are ours; the amount/currency
  // check proves Paystack actually captured the ZAR those cents cost.
  const zarCents = Number(meta.zarCents ?? 0);
  const sigOk = verifyCheckoutSignature(
    {
      purpose: "topup",
      customerId,
      reference,
      usdCents,
      walletApplyCents: 0,
      zarCents,
    },
    meta.sig,
  );
  if (!sigOk) {
    console.warn(`[fulfillment] topup ${reference} has an invalid signature.`);
    return { ok: false, status: "invalid_signature" };
  }
  if (verified.currency !== "ZAR" || verified.amount < zarCents) {
    console.warn(
      `[fulfillment] topup ${reference} paid ${verified.amount} ${verified.currency}, expected ${zarCents} ZAR.`,
    );
    return { ok: false, status: "amount_mismatch" };
  }

  const db = useDb();
  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1);
  if (!customer) {
    console.warn(
      `[fulfillment] topup ${reference} for unknown customer ${customerId}.`,
    );
    return { ok: false, status: "unknown_customer" };
  }

  // Persist the Paystack customer code for future lookups.
  const customerCode = verified.customer?.customer_code;
  if (customerCode && !customer.paystackCustomerCode) {
    await db
      .update(schema.customers)
      .set({ paystackCustomerCode: customerCode })
      .where(eq(schema.customers.id, customer.id));
  }

  const result = await creditWallet({
    customerId,
    type: "topup",
    amountCents: usdCents,
    description: "Wallet top-up",
    reference,
    createdBy: "system",
    chargedZarCents: verified.amount,
    fxRate: meta.fxRate != null ? String(meta.fxRate) : null,
  });

  // A concurrent run (webhook + verify) may have credited first — treat the
  // duplicate as success without re-sending the receipt.
  if (!result.ok && result.duplicate) {
    return { ok: true, status: "success", kind: "topup" };
  }

  // The new funds may cover services that were paused/suspended for
  // non-payment — recover them now rather than waiting for an admin.
  try {
    await recoverSuspendedServices(customerId);
  } catch (err) {
    console.error(
      `[fulfillment] recovery after topup ${reference} failed:`,
      err,
    );
  }

  if (customer.email) {
    const mail = walletTopupEmail({
      name: customer.name,
      amountCents: usdCents,
      balanceAfterCents: result.balanceAfterCents,
      reference,
    });
    void sendEmail({ to: customer.email, replyTo: getSupportEmail(), ...mail });
  }

  return {
    ok: true,
    status: "success",
    kind: "topup",
    balanceAfterCents: result.balanceAfterCents,
  };
}

/* -------------------------------- build -------------------------------- */

async function finalizeBuild(
  reference: string,
  verified: {
    amount: number;
    currency?: string;
    customer?: { email?: string; customer_code?: string };
  },
  meta: Record<string, unknown>,
): Promise<FinalizeResult> {
  const db = useDb();
  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.providerInvoiceId, reference))
    .limit(1);

  if (!invoice) {
    console.info(`[fulfillment] no local invoice for build ref ${reference}.`);
    return { ok: false, status: "no_invoice" };
  }
  if (invoice.status === "paid") {
    return { ok: true, status: "success", kind: "build" };
  }

  const walletApplyCents = Math.max(0, Number(meta.walletApplyCents ?? 0));

  // Only honour metadata WE signed at init (see finalizeTopup) — otherwise a
  // reference whose Paystack init failed could be re-initialised client-side
  // for R1 with a forged walletApplyCents and settle a full-price invoice.
  const zarCents = Number(meta.zarCents ?? 0);
  const sigOk = verifyCheckoutSignature(
    {
      purpose: "build",
      customerId: invoice.customerId,
      reference,
      usdCents: Number(meta.usdCents ?? 0),
      walletApplyCents,
      zarCents,
    },
    meta.sig,
  );
  if (!sigOk) {
    console.warn(`[fulfillment] build ${reference} has an invalid signature.`);
    return { ok: false, status: "invalid_signature", kind: "build" };
  }
  if (verified.currency !== "ZAR" || verified.amount < zarCents) {
    console.warn(
      `[fulfillment] build ${reference} paid ${verified.amount} ${verified.currency}, expected ${zarCents} ZAR.`,
    );
    return { ok: false, status: "amount_mismatch", kind: "build" };
  }

  // Wallet debit + invoice→paid + project transition all commit together.
  let wentNegativeCents = 0;
  let alreadyPaid = false;
  try {
    await db.transaction(async (tx) => {
      // Serialise the webhook + success-page verify pair: lock the invoice row
      // and re-check its status so only one runner transitions it — the loser
      // parks here until the winner commits, then bails without a second site,
      // activity row, or receipt.
      const [locked] = await tx
        .select({ status: schema.invoices.status })
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice.id))
        .for("update")
        .limit(1);
      if (!locked || locked.status === "paid") {
        alreadyPaid = true;
        return;
      }

      if (walletApplyCents > 0) {
        // Paystack has already captured the remainder, so this debit MUST
        // land — even if the balance moved since checkout was created. A
        // small negative balance (alerted to admin below) beats taking the
        // customer's money and leaving the order unfulfilled.
        const walletResult = await debitWallet({
          customerId: invoice.customerId,
          type: "build",
          amountCents: walletApplyCents,
          description: `Wallet applied to build payment (${reference})`,
          reference,
          siteId: invoice.siteId,
          createdBy: "system",
          allowNegative: true,
          tx,
        });
        // Unreachable while allowNegative is true, but if that ever changes a
        // refused debit must roll the whole fulfillment back — not mark the
        // invoice paid with the wallet portion silently uncollected.
        if (!walletResult.ok) {
          throw new WalletInsufficientError(walletResult.shortfallCents ?? 0);
        }
        if (walletResult.balanceAfterCents < 0) {
          wentNegativeCents = walletResult.balanceAfterCents;
        }
      }

      await tx
        .update(schema.invoices)
        .set({ status: "paid", paidAt: new Date(), provider: "paystack" })
        .where(eq(schema.invoices.id, invoice.id));

      const [project] = await tx
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.invoiceId, invoice.id))
        .limit(1);
      if (project?.status === "awaiting_payment") {
        // Provision a draft site for the new build so recurring charges,
        // suspension, and "Your sites" have something to attach to. Guarded by
        // `!project.siteId` (and the paid-early-return above) so re-runs of the
        // idempotent fulfillment never create a second site.
        let siteId = project.siteId;
        if (!siteId) {
          const [site] = await tx
            .insert(schema.sites)
            .values({
              customerId: invoice.customerId,
              name: project.name,
              type: "dynamic",
              origin: "built",
              status: "draft",
              dbHosting: "none",
            })
            .returning({ id: schema.sites.id });
          siteId = site?.id ?? null;
          if (siteId) {
            await tx
              .update(schema.invoices)
              .set({ siteId })
              .where(eq(schema.invoices.id, invoice.id));
          }
        }

        await tx
          .update(schema.projects)
          .set({
            status: "brief_received",
            progress: 10,
            siteId,
            latestUpdate: "Payment received. Your brief is ready for review.",
            updatedAt: new Date(),
          })
          .where(eq(schema.projects.id, project.id));
        await tx.insert(schema.projectActivity).values({
          projectId: project.id,
          type: "payment",
          title: "Payment received",
          details: "The project is ready for studio review.",
        });
      }
    });
  } catch (err) {
    if (err instanceof WalletInsufficientError) {
      console.warn(
        `[fulfillment] wallet debit failed for build ${reference}; shortfall=${err.shortfallCents}`,
      );
      return { ok: false, status: "wallet_insufficient", kind: "build" };
    }
    throw err;
  }

  // A concurrent run already fulfilled this invoice — nothing left to do.
  if (alreadyPaid) {
    return { ok: true, status: "success", kind: "build" };
  }

  if (wentNegativeCents < 0) {
    console.warn(
      `[fulfillment] build ${reference} pushed wallet negative (${wentNegativeCents}c) for customer ${invoice.customerId}.`,
    );
    const adminInbox = getMailAdmin();
    if (adminInbox) {
      void sendEmail({
        to: adminInbox,
        subject: `Wallet went negative on build ${reference}`,
        html: `<p>Fulfilling build <strong>${esc(reference)}</strong> debited a wallet portion after the balance had dropped. Customer ${esc(invoice.customerId)} now sits at ${(wentNegativeCents / 100).toFixed(2)} USD. Review and follow up.</p>`,
        text: `Fulfilling build ${reference} pushed customer ${invoice.customerId} to ${(wentNegativeCents / 100).toFixed(2)} USD. Review and follow up.`,
      });
    }
  }

  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, invoice.customerId))
    .limit(1);

  const customerCode = verified.customer?.customer_code;
  if (customer && customerCode && !customer.paystackCustomerCode) {
    await db
      .update(schema.customers)
      .set({ paystackCustomerCode: customerCode })
      .where(eq(schema.customers.id, customer.id));
  }

  const to = customer?.email || verified.customer?.email;
  if (to) {
    const receipt = receiptEmail({
      name: customer?.name,
      description: invoice.type === "build" ? "Website build" : invoice.type,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      reference,
    });
    void sendEmail({ to, replyTo: getSupportEmail(), ...receipt });
  }

  return { ok: true, status: "success", kind: "build" };
}
