import { z } from "zod";
import { createGameServer } from "./app";
import { noopPersistence, type Persistence } from "./persistence/types";

// Load .env when present (local dev). Variables already set in the environment win.
try {
  process.loadEnvFile();
} catch {
  // No .env file (CI, hosting): use the real environment only.
}

const env = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    CLIENT_ORIGIN: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Milliseconds per market tick. 90 ticks per round; 2000ms ≈ 3 minute trading phase. */
    TICK_MS: z.coerce.number().int().min(10).default(2000),
    STARTING_MS: z.coerce.number().int().min(0).default(10_000),
    RESOLVING_MS: z.coerce.number().int().min(0).default(4_000),
    /** Optional PostgreSQL URL. Without it the server runs purely in memory. */
    DATABASE_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
    /** Optional PEM CA certificate for verifying the database's TLS certificate (e.g. Supabase's). */
    DATABASE_CA_CERT: z.string().optional(),
  })
  .parse(process.env);

const log = (message: string) => console.log(`[market-mayhem] ${message}`);

const clientOrigins = env.CLIENT_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
if (env.NODE_ENV === "production" && !clientOrigins?.length) {
  console.error("[market-mayhem] CLIENT_ORIGIN must be set in production (comma-separated web app URLs).");
  process.exit(1);
}

async function main() {
  let persistence: Persistence = noopPersistence;
  if (env.DATABASE_URL) {
    // Loaded lazily so no database code runs (or needs generating) without DATABASE_URL.
    const { createPrismaPersistence } = await import("./persistence/prisma");
    persistence = createPrismaPersistence(env.DATABASE_URL, log, { caCert: env.DATABASE_CA_CERT || undefined });
    log("persistence: PostgreSQL");
  } else {
    log("persistence: in memory only (DATABASE_URL not set)");
  }

  const server = createGameServer({
    clientOrigins,
    timings: { startingMs: env.STARTING_MS, tickMs: env.TICK_MS, resolvingMs: env.RESOLVING_MS },
    persistence,
    log,
  });

  server.httpServer.listen(env.PORT, () => {
    log(`game server listening on http://localhost:${env.PORT}`);
  });

  const shutdown = () => {
    server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("[market-mayhem] failed to start", error);
  process.exit(1);
});
