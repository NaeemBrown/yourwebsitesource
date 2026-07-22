import { and, eq } from "drizzle-orm";
import {
  getBuildPackage,
  MIN_TOPUP_USD_CENTS,
  MAX_TOPUP_USD_CENTS,
  WALLET_CURRENCY,
  CHARGE_CURRENCY,
} from "../../../shared/billing";
import type { CheckoutPayload } from "../../../shared/checkout";
import { isValidEmail } from "../../../shared/validation";

/**
 * POST /api/checkout/create (WebForgePlan2 §4.3 / §4.6)
 *
 * Starts a Paystack hosted-checkout transaction. Prices are USD; a South
 * African Paystack account charges ZAR, so we convert USD→ZAR here and charge
 * that (the UI shows the ZAR amount before the customer confirms).
 *
 *  - purpose "build" → one-off website package. Records a pending `invoices`
 *    row keyed by the reference; the webhook marks it paid.
 *  - purpose "topup" → adds prepaid wallet credit. The webhook credits the
 *    wallet (in USD) once the ZAR charge succeeds.
 *
 * Returns `{ reference, authorizationUrl, accessCode, usdCents, zarCents }`.
 * Redirect the browser to `authorizationUrl` (hosted page) — on return we
 * verify before granting value (never trust the redirect alone).
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<CheckoutPayload>(event);
    const purpose = body?.purpose === "topup" ? "topup" : "build";

    // Resolve the buyer: prefer the signed-in customer, else the supplied email.
    const identity = await getOptionalCustomer(event);

    // Every purchase must be tied to an authenticated account: builds so the
    // brief, invoice, and project are owned by a real customer (launch req §3),
    // and top-ups so an anonymous caller can't mint junk customer rows for
    // arbitrary emails (the portal always calls this signed in anyway).
    if (!identity) {
      throw createError({
        statusCode: 401,
        statusMessage: "Please sign in to complete your purchase.",
      });
    }

    const email = (identity?.email || body?.email || "").trim().toLowerCase();
    const name = identity?.name || body?.name?.trim() || email;
    if (!isValidEmail(email)) {
      throw createError({
        statusCode: 422,
        statusMessage: "A valid email is required to check out.",
      });
    }

    // Determine USD amount + a human label per purpose.
    let usdCents: number;
    let label: string;
    let buildKey: string | null = null;
    let walletApplyCents = 0;

    if (purpose === "topup") {
      usdCents = Math.round(body?.amountUsdCents ?? 0);
      if (!Number.isFinite(usdCents) || usdCents < MIN_TOPUP_USD_CENTS) {
        throw createError({
          statusCode: 422,
          statusMessage: `Minimum top-up is $${(MIN_TOPUP_USD_CENTS / 100).toFixed(0)}.`,
        });
      }
      if (usdCents > MAX_TOPUP_USD_CENTS) {
        throw createError({
          statusCode: 422,
          statusMessage: `Maximum top-up is $${(MAX_TOPUP_USD_CENTS / 100).toLocaleString("en-US")}.`,
        });
      }
      label = "Wallet top-up";
    } else {
      const pkg = getBuildPackage(body?.planKey ?? "");
      if (!pkg) {
        throw createError({
          statusCode: 422,
          statusMessage: "Unknown build package.",
        });
      }
      usdCents = pkg.amountUsdCents;
      label = `${pkg.label} website build`;
      buildKey = pkg.key;
    }

    const db = useDb();

    // Upsert the customer by email so we have an owner for the invoice/wallet.
    let customer = (
      await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.email, email))
        .limit(1)
    )[0];
    if (!customer) {
      try {
        [customer] = await db
          .insert(schema.customers)
          .values({ name, email, firebaseUid: identity?.uid ?? null })
          .returning();
      } catch (err) {
        // A concurrent checkout for the same new email can win the insert race
        // (unique email constraint). Reuse the row it created instead of 500ing.
        if (!isUniqueViolation(err)) throw err;
        [customer] = await db
          .select()
          .from(schema.customers)
          .where(eq(schema.customers.email, email))
          .limit(1);
      }
    } else if (identity?.uid && !customer.firebaseUid) {
      await db
        .update(schema.customers)
        .set({ firebaseUid: identity.uid })
        .where(eq(schema.customers.id, customer.id));
    }
    if (!customer) {
      throw createError({
        statusCode: 500,
        statusMessage: "Could not resolve customer.",
      });
    }

    let checkoutBrief: typeof schema.checkoutBriefs.$inferSelect | null = null;
    if (purpose === "build" && body?.briefId) {
      const [foundBrief] = await db
        .select()
        .from(schema.checkoutBriefs)
        .where(eq(schema.checkoutBriefs.id, body.briefId))
        .limit(1);
      checkoutBrief = foundBrief ?? null;
      if (
        !checkoutBrief ||
        checkoutBrief.email !== email ||
        checkoutBrief.planKey !== buildKey
      ) {
        throw createError({
          statusCode: 422,
          statusMessage: "That project brief does not match this checkout.",
        });
      }
    }

    // If a siteId is supplied, it must belong to the resolved customer — never
    // trust a client-supplied siteId, or it could be attached to another
    // customer's invoice/wallet debit (horizontal privilege escalation).
    let siteId: string | null = null;
    if (body?.siteId) {
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
      siteId = site.id;
    }

    // Build checkout can apply prepaid wallet funds first for signed-in customers.
    if (purpose === "build" && body?.useWalletFirst && identity?.uid) {
      walletApplyCents = Math.max(
        0,
        Math.min(usdCents, Math.round(customer.walletBalanceCents ?? 0)),
      );
    }

    const chargeUsdCents = Math.max(0, usdCents - walletApplyCents);

    // Convert USD → ZAR for the actual Paystack charge.
    const zarCents = usdCentsToZarCents(chargeUsdCents);
    const fxRate = String(getUsdToZarRate());

    const reference = generateReference(
      purpose === "topup" ? "twf_topup" : "twf_build",
    );
    const config = useRuntimeConfig(event);
    const siteUrl =
      (config.public?.siteUrl as string) ||
      process.env.NUXT_PUBLIC_SITE_URL ||
      getRequestURL(event).origin;
    const callbackUrl = `${siteUrl.replace(/\/$/, "")}/checkout/success?reference=${reference}`;

    // For a build, create the invoice keyed by the reference.
    // - full wallet cover: paid immediately (no Paystack redirect)
    // - otherwise: open until webhook/verify fulfillment marks it paid
    if (purpose === "build") {
      const now = new Date();
      const fullyCoveredByWallet = chargeUsdCents === 0;

      if (fullyCoveredByWallet && walletApplyCents > 0) {
        // Debit the wallet and record the paid invoice in ONE transaction so a
        // failed invoice insert rolls back the debit — we never take money
        // without a matching order record.
        await db.transaction(async (tx) => {
          const debit = await debitWallet({
            customerId: customer.id,
            type: "build",
            amountCents: walletApplyCents,
            description: `${label} (wallet payment)`,
            reference,
            siteId,
            createdBy: "system",
            allowNegative: false,
            tx,
          });

          if (!debit.ok) {
            throw createError({
              statusCode: 409,
              statusMessage:
                "Wallet balance changed. Please refresh and try again.",
            });
          }

          await tx.insert(schema.invoices).values({
            customerId: customer.id,
            siteId,
            type: "build",
            amountCents: usdCents,
            currency: WALLET_CURRENCY,
            status: "paid",
            provider: "wallet",
            providerInvoiceId: reference,
            paidAt: now,
          });
        });
      } else {
        // Not wallet-covered: record an open invoice for Paystack to settle.
        await db.insert(schema.invoices).values({
          customerId: customer.id,
          siteId,
          type: "build",
          amountCents: usdCents,
          currency: WALLET_CURRENCY,
          status: fullyCoveredByWallet ? "paid" : "open",
          provider: fullyCoveredByWallet ? "wallet" : "paystack",
          providerInvoiceId: reference,
          paidAt: fullyCoveredByWallet ? now : null,
        });
      }

      const [invoice] = await db
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.providerInvoiceId, reference))
        .limit(1);
      if (invoice) {
        const [project] = await db
          .insert(schema.projects)
          .values({
            customerId: customer.id,
            invoiceId: invoice.id,
            siteId,
            briefId: checkoutBrief?.id ?? null,
            name: `${label}`,
            planKey: buildKey ?? "build",
            status: fullyCoveredByWallet
              ? "brief_received"
              : "awaiting_payment",
            progress: fullyCoveredByWallet ? 10 : 5,
            brief: checkoutBrief?.answers ?? {},
            latestUpdate: fullyCoveredByWallet
              ? "Payment received. Your brief is ready for review."
              : "Your brief is saved. Complete payment to start the project.",
          })
          .onConflictDoNothing()
          .returning({ id: schema.projects.id });

        if (project) {
          await db.insert(schema.projectActivity).values({
            projectId: project.id,
            type: "brief",
            title: "Project brief submitted",
            details: `${label} selected`,
          });
        }
        if (checkoutBrief) {
          await db
            .update(schema.checkoutBriefs)
            .set({ claimedAt: now })
            .where(eq(schema.checkoutBriefs.id, checkoutBrief.id));
        }

        // Wallet-covered builds never reach finalizeBuild, so mirror its
        // provisioning here: a draft site for recurring charges/"Your sites"
        // to attach to, a payment activity entry, and the receipt.
        if (fullyCoveredByWallet) {
          let provisionedSiteId = siteId;
          if (!provisionedSiteId) {
            const [site] = await db
              .insert(schema.sites)
              .values({
                customerId: customer.id,
                name: label,
                type: "dynamic",
                origin: "built",
                status: "draft",
                dbHosting: "none",
              })
              .returning({ id: schema.sites.id });
            provisionedSiteId = site?.id ?? null;
          }
          if (provisionedSiteId) {
            await db
              .update(schema.invoices)
              .set({ siteId: provisionedSiteId })
              .where(eq(schema.invoices.id, invoice.id));
            await db
              .update(schema.projects)
              .set({ siteId: provisionedSiteId })
              .where(eq(schema.projects.invoiceId, invoice.id));
          }
          if (project) {
            await db.insert(schema.projectActivity).values({
              projectId: project.id,
              type: "payment",
              title: "Payment received",
              details: "Paid in full from wallet credit.",
            });
          }
          if (customer.email) {
            const receipt = receiptEmail({
              name: customer.name,
              description: "Website build",
              amountCents: usdCents,
              currency: WALLET_CURRENCY,
              reference,
            });
            void sendEmail({
              to: customer.email,
              replyTo: getSupportEmail(),
              ...receipt,
            });
          }
        }
      }

      // Wallet-only build purchase: no external checkout needed.
      if (fullyCoveredByWallet) {
        return {
          reference,
          authorizationUrl: `${siteUrl.replace(/\/$/, "")}/checkout/success?reference=${reference}`,
          accessCode: "",
          usdCents,
          zarCents: 0,
          walletAppliedCents: walletApplyCents,
          publicKey: config.public?.paystackPublicKey || "",
        };
      }
    }

    const result = await initializeTransaction({
      email,
      amountCents: zarCents,
      reference,
      callbackUrl,
      currency: CHARGE_CURRENCY,
      metadata: {
        purpose,
        planKey: buildKey,
        customerId: customer.id,
        siteId,
        usdCents,
        walletApplyCents,
        zarCents,
        fxRate,
        label,
        // Fulfillment only honours metadata we signed — anyone holding the
        // public key can initialise a transaction with arbitrary metadata.
        sig: signCheckoutMetadata({
          purpose,
          customerId: customer.id,
          reference,
          usdCents,
          walletApplyCents,
          zarCents,
        }),
      },
    });

    return {
      reference: result.reference,
      authorizationUrl: result.authorization_url,
      accessCode: result.access_code,
      usdCents,
      zarCents,
      walletAppliedCents: walletApplyCents,
      publicKey: config.public?.paystackPublicKey || "",
    };
  } catch (err) {
    toSafeError(err, "checkout/create", "Could not start checkout.");
  }
});
