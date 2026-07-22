/**
 * Paystack REST helper (plan §5.1, Phase 2).
 *
 * A thin wrapper around https://api.paystack.co with the secret key as a Bearer
 * token. No third-party SDK — the REST surface we need is small and stable.
 *
 * Auth: PAYSTACK_SECRET_KEY (server-only). Never expose this to the browser.
 *
 * Money: amounts are integer MINOR units (kobo/cents). For a SA account the
 * currency is ZAR (see shared/billing.ts → BILLING_CURRENCY).
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function getSecretKey(): string {
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

interface PaystackApiResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

/** Low-level call to the Paystack API. Throws on transport/HTTP errors. */
async function paystackFetch<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<T> {
  const res = await $fetch<PaystackApiResponse<T>>(`${PAYSTACK_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: options.body,
  });

  if (!res.status) {
    throw createError({
      statusCode: 502,
      statusMessage: `Paystack: ${res.message || "request failed"}`,
    });
  }
  return res.data;
}

/* --------------------------- transactions --------------------------- */

export interface InitializeTransactionInput {
  email: string;
  /** Amount in minor units (ZAR cents). Required even for plan subscriptions. */
  amountCents: number;
  /** Unique reference we generate, so we can reconcile via the webhook. */
  reference: string;
  /** Where Paystack redirects after payment (success page). */
  callbackUrl: string;
  /** Recurring only: the Paystack Plan code (PLN_...). */
  plan?: string;
  currency?: string;
  /** Arbitrary data echoed back on the transaction + webhook. */
  metadata?: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** POST /transaction/initialize — start a hosted checkout. */
export function initializeTransaction(
  input: InitializeTransactionInput,
): Promise<InitializeTransactionResult> {
  return paystackFetch<InitializeTransactionResult>("/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amountCents,
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: input.currency,
      plan: input.plan,
      metadata: input.metadata,
    },
  });
}

export interface VerifyTransactionResult {
  status: string; // "success" | "failed" | ...
  reference: string;
  amount: number;
  currency: string;
  customer?: { email?: string; customer_code?: string };
  plan?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** GET /transaction/verify/:reference — confirm status/amount before granting value. */
export function verifyTransaction(
  reference: string,
): Promise<VerifyTransactionResult> {
  return paystackFetch<VerifyTransactionResult>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

/* ------------------------------ refunds ----------------------------- */

/** POST /refund — refund a transaction by reference (used by admin in Phase 5). */
export function refundTransaction(input: {
  reference: string;
  amountCents?: number;
}): Promise<unknown> {
  return paystackFetch("/refund", {
    method: "POST",
    body: { transaction: input.reference, amount: input.amountCents },
  });
}

/** Generate a unique, reconcilable transaction reference. */
export function generateReference(prefix = "twf"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
