/**
 * Shared input validators used by both the Vue app and the Nitro server so the
 * rules can't drift between client-side hints and server-side enforcement.
 */

/**
 * Pragmatic email check. Intentionally not a full RFC 5322 parser (those reject
 * many valid addresses and accept many invalid ones); this guards the common
 * mistakes and — crucially — rejects whitespace, so a value that passes can
 * never carry CR/LF into an email header. Final deliverability is verified at
 * send time by the mail provider.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  const email = (value ?? "").trim();
  if (email.length > 254) return false;
  return EMAIL_RE.test(email);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards route/body IDs before they reach a `uuid` column comparison — a
 * non-UUID string otherwise surfaces as an unhandled Postgres 22P02 cast
 * error (a 500) instead of a clean 404/422.
 */
export function isUuid(value: string | null | undefined): boolean {
  return UUID_RE.test((value ?? "").trim());
}

/** Upper bound for stored URLs — long enough for real links, short enough to
 * reject abuse (multi-KB strings) before they reach the database. */
export const MAX_URL_LENGTH = 2048;

/**
 * Accepts an http(s) URL within {@link MAX_URL_LENGTH}. Mirrors the server-side
 * check used when persisting project file/deliverable links.
 */
export function isValidHttpUrl(value: string | null | undefined): boolean {
  const url = (value ?? "").trim();
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return false;
  return /^https?:\/\//.test(url);
}
