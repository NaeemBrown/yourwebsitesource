import { defineConfig } from "vitest/config";

// Unit tests cover pure logic (no Nuxt runtime). Integration tests exercise the
// DB-backed money paths against a live Postgres (DATABASE_URL) and skip
// themselves cleanly when the database is unset/unreachable, so this suite
// stays green without Docker.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Integration tests share one DB — keep files sequential to avoid
    // cross-file interference; tests within a file already run sequentially.
    fileParallelism: false,
  },
});
