import type { H3Event } from "h3";
import { verifyIdToken } from "./firebase-admin";

export interface AdminIdentity {
  email: string;
  uid: string;
  name?: string;
}

/** Parsed, lower-cased ADMIN_EMAILS allowlist from the environment. */
let cachedAllowlist: { raw: string; set: Set<string> } | null = null;
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  // Cache the parsed Set keyed on the raw env string (env is fixed at boot, but
  // keying on `raw` keeps this correct if it's ever changed at runtime in dev).
  if (!cachedAllowlist || cachedAllowlist.raw !== raw) {
    cachedAllowlist = {
      raw,
      set: new Set(
        raw
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    };
  }
  return [...cachedAllowlist.set];
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  getAdminEmails(); // ensure cache is populated/refreshed
  return cachedAllowlist!.set.has(email.toLowerCase());
}

/**
 * Verifies the Bearer ID token on the request and confirms the email is in the
 * ADMIN_EMAILS allowlist. Throws 401/403 otherwise. Returns the admin identity.
 */
export async function requireAdmin(event: H3Event): Promise<AdminIdentity> {
  const header = getHeader(event, "authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: "Missing bearer token.",
    });
  }

  let decoded;
  try {
    // checkRevoked=true (S4): an admin whose session was revoked or whose
    // account was disabled loses access immediately, not after token expiry.
    decoded = await verifyIdToken(token, true);
  } catch {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid or expired token.",
    });
  }

  if (!decoded.email || decoded.email_verified !== true) {
    throw createError({
      statusCode: 403,
      statusMessage: "No verified email on account.",
    });
  }
  if (!isAdminEmail(decoded.email)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Not authorized for admin.",
    });
  }

  return {
    email: decoded.email,
    uid: decoded.uid,
    name: typeof decoded.name === "string" ? decoded.name : undefined,
  };
}
