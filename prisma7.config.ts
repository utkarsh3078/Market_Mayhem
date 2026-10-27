import { defineConfig } from "prisma/config";

// Load .env when present (Node 22+), so `pnpm db:*` commands see DATABASE_URL locally.
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (CI, hosting).
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI connection (migrations). DIRECT_URL is a session/direct connection for poolers such as
    // Supabase's transaction pooler; the running server always uses DATABASE_URL.
    // Not env(): that throws when unset, and `prisma generate` must work without a database.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
