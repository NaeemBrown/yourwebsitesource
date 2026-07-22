import { eq, sql } from "drizzle-orm";

/**
 * Wallet ledger (WebForgePlan2 §4.2).
 *
 * The ONLY place that mutates a customer's prepaid balance, so the append-only
 * ledger (`wallet_transactions`) and the cached `customers.wallet_balance_cents`
 * can never drift. Every mutation happens inside a DB transaction.
 *
 * All amounts are **USD cents**. `credit` adds, `debit` subtracts. A debit
 * refuses to take the balance below zero unless `allowNegative` is set (admin
 * override).
 */

export type WalletTxnType =
  | "topup"
  | "build"
  | "hosting"
  | "database"
  | "domain"
  | "feature"
  | "change"
  | "refund"
  | "adjustment";

export interface WalletMutationInput {
  customerId: string;
  type: WalletTxnType;
  /** Positive USD cents (direction is decided by credit vs debit). */
  amountCents: number;
  description: string;
  reference?: string | null;
  siteId?: string | null;
  /** Admin email, or "system" for the scheduled job. */
  createdBy?: string;
  /** Top-up audit trail. */
  chargedZarCents?: number | null;
  fxRate?: string | null;
}

export interface WalletResult {
  ok: boolean;
  balanceAfterCents: number;
  /** When a debit is declined for insufficient funds, how much was short. */
  shortfallCents?: number;
  transactionId?: string;
  /** True when a credit was rejected because the reference was already used. */
  duplicate?: boolean;
}

/**
 * A Drizzle transaction handle, as passed to the `db.transaction()` callback.
 * Lets callers run a wallet mutation inside an existing transaction so the
 * balance change commits/rolls back atomically with their own writes.
 */
export type WalletTx = Parameters<
  Parameters<ReturnType<typeof useDb>["transaction"]>[0]
>[0];

/** Current cached USD-cents balance for a customer. */
export async function getWalletBalance(customerId: string): Promise<number> {
  const db = useDb();
  const [row] = await db
    .select({ balance: schema.customers.walletBalanceCents })
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1);
  return row?.balance ?? 0;
}

/**
 * Idempotency guard for top-ups: returns true if a wallet transaction with this
 * Paystack reference already exists (so webhook retries don't double-credit).
 */
export async function walletHasReference(reference: string): Promise<boolean> {
  const db = useDb();
  const [row] = await db
    .select({ id: schema.walletTransactions.id })
    .from(schema.walletTransactions)
    .where(eq(schema.walletTransactions.reference, reference))
    .limit(1);
  return !!row;
}

/** Add credit to a wallet (top-up, refund, goodwill adjustment). */
export async function creditWallet(
  input: WalletMutationInput,
): Promise<WalletResult> {
  try {
    return await applyDelta(input, Math.abs(Math.round(input.amountCents)));
  } catch (err) {
    // Unique-violation on `reference` means this top-up was already credited
    // (webhook + verify race). Treat as a no-op duplicate, not an error.
    if (isUniqueViolation(err)) {
      const balance = await getWalletBalance(input.customerId);
      return { ok: false, duplicate: true, balanceAfterCents: balance };
    }
    throw err;
  }
}

/**
 * Detect a Postgres unique-constraint violation (SQLSTATE 23505). Drizzle
 * wraps driver errors (DrizzleQueryError) with the original pg error on
 * `cause`, so walk the cause chain rather than only checking the top level —
 * otherwise a real webhook+verify race surfaces as a 500 instead of deduping.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (
    let depth = 0;
    depth < 5 && typeof current === "object" && current !== null;
    depth++
  ) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Debit a wallet (recurring charge, feature/change billing). Declines if it
 * would go negative, unless `allowNegative` is true.
 */
export async function debitWallet(
  input: WalletMutationInput & { allowNegative?: boolean; tx?: WalletTx },
): Promise<WalletResult> {
  const magnitude = Math.abs(Math.round(input.amountCents));
  return applyDelta(input, -magnitude, input.allowNegative ?? false, input.tx);
}

/**
 * Shared transactional balance mutation. `delta` is signed USD cents. When an
 * existing `tx` is supplied, the mutation joins that transaction so it commits
 * or rolls back atomically with the caller's other writes; otherwise it opens
 * its own transaction.
 */
async function applyDelta(
  input: WalletMutationInput,
  delta: number,
  // Safe-by-default: never let a debit overdraw unless a caller explicitly opts
  // in (debitWallet passes this through; credits use positive deltas so the
  // negative-balance guard never applies to them).
  allowNegative = false,
  existingTx?: WalletTx,
): Promise<WalletResult> {
  const db = useDb();
  if (existingTx) return mutate(existingTx, input, delta, allowNegative);
  return db.transaction((tx) => mutate(tx, input, delta, allowNegative));
}

/** Core balance mutation, always run inside a transaction `tx`. */
async function mutate(
  tx: WalletTx,
  input: WalletMutationInput,
  delta: number,
  allowNegative: boolean,
): Promise<WalletResult> {
  // Lock the customer row for the duration of the transaction so concurrent
  // debits/credits can't race on the balance.
  const [customer] = await tx
    .select({ balance: schema.customers.walletBalanceCents })
    .from(schema.customers)
    .where(eq(schema.customers.id, input.customerId))
    .for("update")
    .limit(1);

  if (!customer) {
    throw createError({
      statusCode: 404,
      statusMessage: "Customer not found.",
    });
  }

  const current = customer.balance ?? 0;
  const next = current + delta;

  if (delta < 0 && next < 0 && !allowNegative) {
    return { ok: false, balanceAfterCents: current, shortfallCents: -next };
  }

  const [txn] = await tx
    .insert(schema.walletTransactions)
    .values({
      customerId: input.customerId,
      type: input.type,
      amountCents: delta,
      balanceAfterCents: next,
      currency: "USD",
      chargedZarCents: input.chargedZarCents ?? null,
      fxRate: input.fxRate ?? null,
      description: input.description,
      reference: input.reference ?? null,
      siteId: input.siteId ?? null,
      createdBy: input.createdBy ?? "system",
    })
    .returning({ id: schema.walletTransactions.id });

  await tx
    .update(schema.customers)
    .set({
      walletBalanceCents: sql`${schema.customers.walletBalanceCents} + ${delta}`,
    })
    .where(eq(schema.customers.id, input.customerId));

  return { ok: true, balanceAfterCents: next, transactionId: txn?.id };
}
