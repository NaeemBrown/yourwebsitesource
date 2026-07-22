import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaystackData, PaystackEvent } from "../../types/paystack";

/**
 * POST /api/webhooks/paystack
 *
 * Keeps our DB in sync with Paystack (see plan §5.3). Paystack signs every
 * request with an `x-paystack-signature` header that is the HMAC-SHA512 of the
 * **raw** request body using our secret key.
 *
 * The Website Forge runs the wallet model: all recurring billing is debited
 * from the prepaid wallet by the scheduled task (not Paystack card
 * subscriptions). So the only Paystack event we act on is `charge.success`
 * (wallet top-ups and one-off build payments). The legacy Paystack-native
 * subscription/invoice events are intentionally ignored (acknowledged with 200)
 * — see the deprecated `subscriptions` table.
 *
 * Security:
 *  - We read the RAW body so the signature check matches the exact bytes hashed.
 *  - We reject any request whose signature doesn't verify (401).
 *  - Handlers are idempotent: Paystack retries delivery.
 *
 * Unknown events are acknowledged with 200 so Paystack stops retrying them.
 * Handler FAILURES return 500 on purpose: the handlers are idempotent (unique
 * ledger reference, invoice paid-check), so Paystack's redelivery is the
 * recovery path for transient errors — swallowing them would leave captured
 * money unfulfilled with no retry.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    // Misconfiguration — fail loudly so it's caught in dev, never silently.
    throw createError({
      statusCode: 500,
      statusMessage:
        "PAYSTACK_SECRET_KEY is not set. Add it to .env (see plan §3.1).",
    });
  }

  // 1) Read the RAW body — required for an exact signature match.
  const raw = await readRawBody(event, "utf8");
  if (!raw) {
    throw createError({
      statusCode: 400,
      statusMessage: "Empty webhook body.",
    });
  }

  // 2) Verify the x-paystack-signature header (HMAC-SHA512 of the raw body).
  const signature = getHeader(event, "x-paystack-signature");
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  if (!signature || !safeEqualHex(signature, expected)) {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid Paystack signature.",
    });
  }

  // 3) Signature is valid — now it's safe to parse and act on the payload.
  let payload: PaystackEvent;
  try {
    payload = JSON.parse(raw) as PaystackEvent;
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Malformed JSON body.",
    });
  }

  const type = payload.event;
  const data = payload.data ?? {};

  try {
    switch (type) {
      case "charge.success":
        await handleChargeSuccess(data);
        break;
      default:
        // Everything else (including legacy subscription.*/invoice.* events from
        // the retired card-subscription model) is acknowledged and ignored.
        console.info(`[paystack] ignoring event: ${type}`);
    }
  } catch (err) {
    // Surface as 500 so Paystack redelivers — fulfillment is idempotent, and
    // redelivery is the only automatic recovery for a transient DB failure
    // (the customer may never revisit the success page to trigger verify).
    console.error(`[paystack] handler for "${type}" failed:`, err);
    throw createError({
      statusCode: 500,
      statusMessage: "Webhook handler failed; Paystack will retry.",
    });
  }

  return { received: true };
});

/* --------------------------- event handlers --------------------------- */

/**
 * `charge.success` — a payment cleared (top-up or one-off build). Delegates to
 * the shared idempotent fulfillment helper, which re-verifies with Paystack and
 * then credits the wallet (top-up) or marks the invoice paid (build). The same
 * helper runs from the checkout-verify step, so either path completes the order.
 */
async function handleChargeSuccess(data: PaystackData) {
  const reference = data.reference;
  if (!reference) return;
  const result = await finalizeByReference(reference);
  // Transient outcomes come back as results, not throws — surface them so the
  // 500 path triggers redelivery: verify_failed is a Paystack API
  // timeout/5xx, and the pending-family statuses appear when the verify API
  // lags the charge.success event. Permanent outcomes (invalid_signature,
  // amount_mismatch, ...) would fail identically on every retry, so those
  // are ACKed.
  const RETRYABLE = ["verify_failed", "pending", "ongoing", "processing", "queued"];
  if (!result.ok && RETRYABLE.includes(result.status)) {
    throw new Error(
      `fulfillment not final for ${reference} (${result.status}); awaiting redelivery`,
    );
  }
}

/* ------------------------------- helpers ------------------------------- */

/** Constant-time compare of two hex-encoded strings. */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
