import { z } from "zod";
import { createGeminiDebrief, DEFAULT_GEMINI_MODEL, type DebriefGenerator } from "./ai/debrief";
import { GuardedModel, createTextModel } from "./ai/model";
import { DEFAULT_QUOTA, QuotaLimiter } from "./ai/rateLimit";
import { createAiScenarios, noAiScenarios, type AiScenarios } from "./ai/services";
import { createTextModelDebrief } from "./ai/textModelDebrief";
import { createGameServer } from "./app";
import { parseClientOrigins } from "./origins";
import { noopPersistence, type Persistence } from "./persistence/types";
import { SCENARIOS } from "./scenarios";

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
    /**
     * Optional. One Google AI Studio key turns on Gemma 4: AI-written scenarios and the round summary.
     * Server-side only, never sent to browsers.
     */
    GEMINI_API_KEY: z.string().optional(),
    /** Set to a Gemini model (e.g. gemini-3.5-flash-lite) to keep the round summary on Gemini instead of Gemma. */
    GEMINI_MODEL: z.string().trim().optional().transform((v) => v || undefined),
    /** Self-hosted alternative to the Gemini API, e.g. http://localhost:11434 for Ollama. */
    OLLAMA_URL: z.string().trim().optional().transform((v) => v || undefined),
    /** Force a Gemma backend, or "off". Default: the Gemini API if a key is set, else Ollama. */
    GEMMA_PROVIDER: z.preprocess((v) => (typeof v === "string" ? v.trim() || undefined : v), z.enum(["gemini", "ollama", "off"]).optional()),
    /** Gemini API: gemma-4-26b-a4b-it (default, faster) or gemma-4-31b-it. Ollama: e.g. gemma4. */
    GEMMA_MODEL: z.string().trim().optional().transform((v) => v || undefined),
    GEMMA_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(90_000),
    /** Gemma-written scenarios kept ready in the background (0 = write only on demand). */
    AI_POOL_SIZE: z.coerce.number().int().min(0).max(5).default(2),
    /** Fill the scenario pool at boot. "false" spends no quota until a host asks for an AI scenario. */
    AI_WARMUP: z.string().trim().optional(),
    /** Minimum gap between Gemma calls, on top of the quota limiter. */
    AI_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(4_000),
    /** The API key's quota (requests/min, tokens/min, requests/day). The server stays 10% under each. */
    GEMINI_RPM: z.coerce.number().int().positive().default(DEFAULT_QUOTA.rpm),
    GEMINI_TPM: z.coerce.number().int().positive().default(DEFAULT_QUOTA.tpm),
    GEMINI_RPD: z.coerce.number().int().positive().default(DEFAULT_QUOTA.rpd),
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

  // One Google key and one quota limiter cover everything the server asks a model to do.
  const textModel = createTextModel({
    provider: env.GEMMA_PROVIDER,
    geminiApiKey: env.GEMINI_API_KEY,
    ollamaUrl: env.OLLAMA_URL,
    model: env.GEMMA_MODEL ?? (env.GEMINI_MODEL && /^gemma/i.test(env.GEMINI_MODEL) ? env.GEMINI_MODEL : undefined),
    timeoutMs: env.GEMMA_TIMEOUT_MS,
  });
  // An explicit Gemini model keeps the summary on Gemini; with Gemma off, a key alone keeps the old default.
  const summaryOnGemini =
    Boolean(env.GEMINI_API_KEY) && (env.GEMINI_MODEL ? !/^gemma/i.test(env.GEMINI_MODEL) : !textModel);

  // Google's quota only applies to the Gemini API; a self-hosted Ollama has none.
  const gemmaOnGoogle = Boolean(textModel) && (env.GEMMA_PROVIDER === "gemini" || (!env.GEMMA_PROVIDER && Boolean(env.GEMINI_API_KEY)));

  let debrief: DebriefGenerator | undefined;
  let ai: AiScenarios = noAiScenarios;
  if (textModel || summaryOnGemini) {
    const limiter = new QuotaLimiter({ rpm: env.GEMINI_RPM, tpm: env.GEMINI_TPM, rpd: env.GEMINI_RPD });
    // Each finished round made at most one call, so recent rounds restore the daily count after a restart.
    limiter.seed(await persistence.roundsFinishedSince(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    const { rpm, tpm, rpd } = limiter.limits;
    const budget = `at most ${rpm} req/min, ${tpm} tokens/min, ${rpd} req/day`;

    if (textModel) {
      const guarded = new GuardedModel(textModel, {
        minIntervalMs: gemmaOnGoogle ? env.AI_MIN_INTERVAL_MS : 0,
        limiter: gemmaOnGoogle ? limiter : undefined,
        log,
      });
      ai = createAiScenarios({
        model: guarded,
        fallbacks: [...SCENARIOS.values()],
        poolSize: env.AI_POOL_SIZE,
        warmUp: env.AI_WARMUP?.toLowerCase() !== "false",
        log,
      });
      if (!summaryOnGemini) debrief = createTextModelDebrief(guarded);
      log(`AI scenarios: on (${textModel.name}, ${gemmaOnGoogle ? budget : "self-hosted, no quota limit"})`);
    }
    if (summaryOnGemini) {
      const model = env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
      debrief = createGeminiDebrief({ apiKey: env.GEMINI_API_KEY!, model, limiter, log });
      log(`AI round summary: on (${model}, ${budget})`);
    } else if (debrief && textModel) {
      log(`AI round summary: on (${textModel.name})`);
    }
  } else {
    log("AI: off (set GEMINI_API_KEY to enable Gemma scenarios and the round summary)");
  }

  const server = createGameServer({
    clientOrigins,
    timings: { startingMs: env.STARTING_MS, tickMs: env.TICK_MS, resolvingMs: env.RESOLVING_MS },
    persistence,
    debrief,
    ai,
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