import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Checkout metadata signing.
 *
 * Paystack Inline/Popup lets anyone holding our PUBLIC key initialise a
 * transaction with an arbitrary reference, amount, and metadata — so
 * transaction metadata is attacker-controllable and must never be trusted on
 * its own. Fulfillment only honours metadata carrying a valid HMAC minted by
 * OUR server at init time (the secret never leaves the server), which proves
 * we initialised the transaction with exactly these amounts.
 */

function getSigningSecret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw createError({
      statusCode: 500,
      statusMessage:
        "PAYSTACK_SECRET_KEY is not set. Add it to .env (see plan §3.1).",
    });
  }
  return key;
}

export interface CheckoutSigInput {
  purpose: string;
  customerId: string;
  reference: string;
  /** USD value being granted (wallet credit or invoice amount). */
  usdCents: number;
  /** Wallet portion debited at fulfillment (builds; 0 for top-ups). */
  walletApplyCents: number;
  /** ZAR minor units Paystack must have charged for this grant. */
  zarCents: number;
}

function payload(input: CheckoutSigInput): string {
  return [
    input.purpose,
    input.customerId,
    input.reference,
    input.usdCents,
    input.walletApplyCents,
    input.zarCents,
  ].join("|");
}

/** HMAC to embed in the transaction metadata at init time. */
export function signCheckoutMetadata(input: CheckoutSigInput): string {
  return createHmac("sha256", getSigningSecret())
    .update(payload(input))
    .digest("hex");
}

/** Constant-time check of a metadata signature at fulfillment time. */
export function verifyCheckoutSignature(
  input: CheckoutSigInput,
  signature: unknown,
): boolean {
  if (typeof signature !== "string" || !signature) return false;
  const expected = signCheckoutMetadata(input);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
