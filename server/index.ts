import { z } from "zod";
import { createGeminiDebrief, DEFAULT_GEMINI_MODEL, type DebriefGenerator } from "./ai/debrief";
import { DEFAULT_QUOTA, QuotaLimiter } from "./ai/rateLimit";
import { createGameServer } from "./app";
import { createGeminiScriptGenerator } from "./newsroom/gemini";
import type { ScriptGenerator } from "./newsroom/scripts";
import { parseClientOrigins } from "./origins";
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
    /** Optional. Enables the AI-written round summary (U6). Server-side only, never sent to browsers. */
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default(DEFAULT_GEMINI_MODEL),
    /** The API key's quota (requests/min, tokens/min, requests/day). The server stays 10% under each. */
    GEMINI_RPM: z.coerce.number().int().positive().default(DEFAULT_QUOTA.rpm),
    GEMINI_TPM: z.coerce.number().int().positive().default(DEFAULT_QUOTA.tpm),
    GEMINI_RPD: z.coerce.number().int().positive().default(DEFAULT_QUOTA.rpd),
    /** "random": a new price seed every round. "scenario": each scenario's fixed seed (demos, replays). */
    ROUND_SEED: z.enum(["random", "scenario"]).default("random"),
    /** Live Newsroom anchor scripts: "none" (built-in templates) or "gemini" (needs GEMINI_API_KEY). */
    NEWSROOM_SCRIPTS: z.enum(["none", "gemini"]).default("none"),
    /** Model for newsroom scripts (a Gemini or Gemma model id). Defaults to GEMINI_MODEL. */
    NEWSROOM_MODEL: z.string().optional(),
  })
  .parse(process.env);

const log = (message: string) => console.log(`[market-mayhem] ${message}`);

const clientOrigins = parseClientOrigins(env.CLIENT_ORIGIN);
if (env.NODE_ENV === "production" && !clientOrigins.length) {
  console.error("[market-mayhem] CLIENT_ORIGIN must be set in production (comma-separated web app URLs).");
  process.exit(1);
}
log(`allowed origins: ${clientOrigins.length ? clientOrigins.join(", ") : "any (CLIENT_ORIGIN not set)"}`);

async function main() {
  let persistence: Persistence = noopPersistence;
  if (env.DATABASE_URL) {
    // Loaded lazily so no database code runs (or needs generating) without DATABASE_URL.
    // A broken database setup must never stop the game, so fall back to memory if it can't load.
    try {
      const { createPrismaPersistence } = await import("./persistence/prisma");
      persistence = createPrismaPersistence(env.DATABASE_URL, log, { caCert: env.DATABASE_CA_CERT || undefined });
      log("persistence: PostgreSQL");
    } catch (error) {
      console.error(
        "[market-mayhem] persistence DISABLED, running in memory only. Could not load the database client " +
          "(run `pnpm db:generate`):",
        error instanceof Error ? error.message.split("\n")[0] : error,
      );
    }
  } else {
    log("persistence: in memory only (DATABASE_URL not set)");
  }

  let debrief: DebriefGenerator | undefined;
  let newsroomScripts: ScriptGenerator | undefined;
  if (env.GEMINI_API_KEY) {
    // One limiter for the key: the round summary and newsroom scripts share its quota.
    const limiter = new QuotaLimiter({ rpm: env.GEMINI_RPM, tpm: env.GEMINI_TPM, rpd: env.GEMINI_RPD });
    // Each finished round made at most one call, so recent rounds restore the daily count after a restart.
    limiter.seed(await persistence.roundsFinishedSince(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    debrief = createGeminiDebrief({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, limiter, log });
    const { rpm, tpm, rpd } = limiter.limits;
    log(`AI round summary: on (${env.GEMINI_MODEL}, at most ${rpm} req/min, ${tpm} tokens/min, ${rpd} req/day)`);
    if (env.NEWSROOM_SCRIPTS === "gemini") {
      const model = env.NEWSROOM_MODEL || env.GEMINI_MODEL;
      newsroomScripts = createGeminiScriptGenerator({ apiKey: env.GEMINI_API_KEY, model, limiter, log });
      log(`newsroom scripts: ${model}, cached per scenario, templates as fallback`);
    }
  } else {
    log("AI round summary: off (GEMINI_API_KEY not set)");
  }
  if (!newsroomScripts) {
    if (env.NEWSROOM_SCRIPTS === "gemini") log("newsroom scripts: GEMINI_API_KEY not set, using templates");
    else log("newsroom scripts: built-in templates");
  }
  log(`round seeds: ${env.ROUND_SEED === "random" ? "fresh every round" : "fixed per scenario"}`);

  const server = createGameServer({
    clientOrigins,
    timings: { startingMs: env.STARTING_MS, tickMs: env.TICK_MS, resolvingMs: env.RESOLVING_MS },
    persistence,
    debrief,
    newsroomScripts,
    randomSeeds: env.ROUND_SEED === "random",
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
