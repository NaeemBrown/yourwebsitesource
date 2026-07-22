/**
 * Lightweight per-IP rate limiting + request-size guard for abuse-prone
 * endpoints (issues.md #5). Uses a fixed-window counter in module memory.
 *
 * NOTE: this is per-instance. On a single Node deployment it is effective; if
 * you scale to multiple instances or serverless, back it with a shared store
 * (e.g. Redis) so the window is global. The map is pruned lazily to avoid
 * unbounded growth.
 *
 * Client IP (S1): `X-Forwarded-For` is attacker-controlled and must NOT be
 * trusted blindly, or an attacker rotates it to get a fresh counter per request.
 * We only honour a forwarded header when an explicit trusted edge header is
 * configured via `RATE_LIMIT_TRUSTED_IP_HEADER` (e.g. `cf-connecting-ip` behind
 * Cloudflare). Otherwise we use the raw socket address, which a client cannot
 * spoof.
 */
import type { H3Event } from "h3";

interface Rule {
  /** Max requests allowed within the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** HTTP methods this rule applies to. Defaults to POST only. */
  methods?: string[];
}

/** Route prefix → limit. Matched by `pathname.startsWith(prefix)`. */
const RULES: Record<string, Rule> = {
  "/api/contact": { max: 10, windowMs: 60 * 60 * 1000 }, // 10 / hour
  "/api/checkout/create": { max: 30, windowMs: 60 * 60 * 1000 }, // 30 / hour
  // Unauthenticated insert + admin email per call — same abuse surface as
  // /api/contact.
  "/api/checkout/brief": { max: 10, windowMs: 60 * 60 * 1000 }, // 10 / hour
  // Admin surface (S3): throttle every method so a stolen token can't be driven
  // at machine speed. Money-moving routes get a tighter, separate bucket.
  "/api/admin/wallet": {
    max: 30,
    windowMs: 60 * 1000,
    methods: ["POST", "PATCH", "PUT", "DELETE"],
  },
  "/api/admin/recurring": {
    max: 30,
    windowMs: 60 * 1000,
    methods: ["POST", "PATCH", "PUT", "DELETE"],
  },
  "/api/admin": {
    max: 300,
    windowMs: 60 * 1000,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  },
};

/** Longest prefix wins so `/api/admin/wallet` beats the generic `/api/admin`. */
const RULE_PREFIXES = Object.keys(RULES).sort((a, b) => b.length - a.length);

/**
 * Max accepted request body for mutating API calls (S5). Paystack webhooks and
 * our own JSON payloads are all well under this; anything larger is rejected
 * before it's buffered into memory or persisted.
 */
const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface Counter {
  count: number;
  resetAt: number;
}

const hits = new Map<string, Counter>();
let lastPrune = 0;

function prune(now: number): void {
  // Sweep expired entries at most once a minute.
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, c] of hits) {
    if (c.resetAt <= now) hits.delete(key);
  }
}

/** Resolve a client IP that the caller cannot spoof. */
function clientIp(event: H3Event): string {
  const trustedHeader = process.env.RATE_LIMIT_TRUSTED_IP_HEADER?.toLowerCase();
  if (trustedHeader) {
    // Set by a trusted edge/proxy only — safe to read.
    const forwarded = getRequestHeader(event, trustedHeader);
    if (forwarded) return forwarded.split(",")[0]!.trim();
  }
  // No trusted proxy configured: use the raw socket address (unspoofable).
  return getRequestIP(event) || "unknown";
}

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname;

  // Body-size guard (S5): reject oversized mutating requests to any API route
  // before they're read into memory.
  if (pathname.startsWith("/api/") && MUTATING_METHODS.has(event.method)) {
    const declared = Number(getRequestHeader(event, "content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: "Request body too large.",
      });
    }
  }

  const prefix = RULE_PREFIXES.find((p) => pathname.startsWith(p));
  if (!prefix) return;

  const rule = RULES[prefix]!;
  const methods = rule.methods ?? ["POST"];
  if (!methods.includes(event.method)) return;

  const now = Date.now();
  prune(now);

  const key = `${prefix}:${clientIp(event)}`;

  let counter = hits.get(key);
  if (!counter || counter.resetAt <= now) {
    counter = { count: 0, resetAt: now + rule.windowMs };
    hits.set(key, counter);
  }
  counter.count += 1;

  const remaining = Math.max(0, rule.max - counter.count);
  setResponseHeader(event, "X-RateLimit-Limit", String(rule.max));
  setResponseHeader(event, "X-RateLimit-Remaining", String(remaining));

  if (counter.count > rule.max) {
    const retryAfter = Math.ceil((counter.resetAt - now) / 1000);
    setResponseHeader(event, "Retry-After", retryAfter);
    throw createError({
      statusCode: 429,
      statusMessage: "Too many requests. Please try again later.",
    });
  }
});
