import "dotenv/config";

/**
 * Nitro auto-imports (`useDb`, `schema`, `createError`) don't exist in a
 * plain vitest process — shim them onto globalThis so the server utils under
 * test (wallet.ts, recovery.ts, db.ts) resolve exactly as they do at runtime.
 * Requires DATABASE_URL (docker Postgres) with migrations applied.
 */
import * as schema from "../../server/database/schema";

interface ErrorInput {
  statusCode?: number;
  statusMessage?: string;
}

(globalThis as Record<string, unknown>).createError = (input: ErrorInput) =>
  Object.assign(new Error(input.statusMessage ?? "error"), input);
(globalThis as Record<string, unknown>).schema = schema;

// useDb comes from server/utils/db.ts, which itself only needs createError —
// import it AFTER the shim above and re-expose it as a global.
const { useDb } = await import("../../server/utils/db");
(globalThis as Record<string, unknown>).useDb = useDb;
