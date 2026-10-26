import { z } from "zod";
import { createGameServer } from "./app";

const env = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    CLIENT_ORIGIN: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Milliseconds per market tick. 90 ticks per round; 2000ms ≈ 3 minute trading phase. */
    TICK_MS: z.coerce.number().int().min(10).default(2000),
    STARTING_MS: z.coerce.number().int().min(0).default(10_000),
    RESOLVING_MS: z.coerce.number().int().min(0).default(4_000),
  })
  .parse(process.env);

const clientOrigins = env.CLIENT_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
if (env.NODE_ENV === "production" && !clientOrigins?.length) {
  console.error("[market-mayhem] CLIENT_ORIGIN must be set in production (comma-separated web app URLs).");
  process.exit(1);
}

const server = createGameServer({
  clientOrigins,
  timings: { startingMs: env.STARTING_MS, tickMs: env.TICK_MS, resolvingMs: env.RESOLVING_MS },
  log: (message) => console.log(`[market-mayhem] ${message}`),
});

server.httpServer.listen(env.PORT, () => {
  console.log(`[market-mayhem] game server listening on http://localhost:${env.PORT}`);
});

const shutdown = () => {
  server.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
