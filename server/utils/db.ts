import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../database/schema";

/**
 * Lazily-created singleton Drizzle client backed by a pg connection pool.
 * Auto-imported across Nitro server routes as `useDb()`.
 */
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function useDb() {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw createError({
      statusCode: 500,
      statusMessage: "DATABASE_URL is not set. Copy .env.example to .env.",
    });
  }

  _pool = new Pool({ connectionString });
  // Without a listener, an idle client dropping (Postgres restart, network
  // blip) emits an unhandled 'error' event and crashes the whole process.
  // The pool discards the broken client and mints a new one on next use.
  _pool.on("error", (err) => {
    console.error("[db] idle client error (recovered):", err.message);
  });
  _db = drizzle(_pool, { schema });
  return _db;
}

export { schema };
