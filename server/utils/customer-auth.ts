import type { H3Event } from "h3";
import { eq } from "drizzle-orm";
import { verifyIdToken } from "./firebase-admin";

/**
 * Customer authentication (plan §5.4 / Phase 4).
 *
 * Unlike `requireAdmin`, this does NOT gate on the ADMIN_EMAILS allowlist — any
 * signed-in Firebase user is a valid customer. We always resolve to the matching
 * `customers` row (by firebaseUid, then email), so callers can safely filter
 * data by the verified identity and never trust client-supplied IDs.
 */

export interface CustomerIdentity {
  uid: string;
  email: string;
  name?: string;
}

/** Verify the Bearer token, or return null if absent/invalid (no throw). */
export async function getOptionalCustomer(
  event: H3Event,
): Promise<CustomerIdentity | null> {
  const header = getHeader(event, "authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await verifyIdToken(token);
    // Require a VERIFIED email: customers are matched/linked by email, so an
    // unverified address could otherwise claim another customer's record.
    // Google sign-in always verifies; this guards future providers.
    if (!decoded.email || decoded.email_verified !== true) return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
    };
  } catch {
    return null;
  }
}

/** Verify the Bearer token or throw 401. */
export async function requireCustomer(
  event: H3Event,
): Promise<CustomerIdentity> {
  const identity = await getOptionalCustomer(event);
  if (!identity) {
    throw createError({ statusCode: 401, statusMessage: "Sign in required." });
  }
  return identity;
}

/**
 * Find the `customers` row for a verified identity, matching by firebaseUid
 * first and falling back to email. Optionally creates the row if missing.
 * Backfills firebaseUid on an email-matched row so future lookups are by UID.
 */
export async function resolveCustomer(
  identity: CustomerIdentity,
  options: { createIfMissing?: boolean } = {},
) {
  const db = useDb();

  const [byUid] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.firebaseUid, identity.uid))
    .limit(1);
  if (byUid) return byUid;

  const [byEmail] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.email, identity.email))
    .limit(1);
  if (byEmail) {
    if (!byEmail.firebaseUid) {
      const [updated] = await db
        .update(schema.customers)
        .set({ firebaseUid: identity.uid })
        .where(eq(schema.customers.id, byEmail.id))
        .returning();
      return updated ?? byEmail;
    }
    return byEmail;
  }

  if (!options.createIfMissing) return null;

  const [created] = await db
    .insert(schema.customers)
    .values({
      name: identity.name || identity.email,
      email: identity.email,
      firebaseUid: identity.uid,
    })
    .returning();
  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create customer record.",
    });
  }
  return created;
}
