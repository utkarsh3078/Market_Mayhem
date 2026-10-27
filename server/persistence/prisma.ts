import { PrismaPg } from "@prisma/adapter-pg";
import type { GameResults } from "../../shared/types";
import { PrismaClient, type Prisma } from "../generated/prisma/client";
import { pgPoolConfig } from "./connection";
import { describeError, WriteQueue } from "./queue";
import type { Persistence } from "./types";

// Only loaded (via dynamic import in server/index.ts) when DATABASE_URL is set.

const READ_TIMEOUT_MS = 3_000;

export function createPrismaPersistence(
  databaseUrl: string,
  log: (message: string) => void,
  options: { caCert?: string } = {},
): Persistence {
  const adapter = new PrismaPg(pgPoolConfig(databaseUrl, options.caCert));
  // Minimal errors: one-line failure logs instead of multi-line code frames.
  const prisma = new PrismaClient({ adapter, errorFormat: "minimal" });
  const queue = new WriteQueue(log);

  return {
    roundStarted(r) {
      queue.push(`roundStarted ${r.roundId}`, () =>
        prisma.$transaction([
          ...r.players.map((p) =>
            prisma.player.upsert({
              where: { id: p.id },
              create: { id: p.id, displayName: p.displayName },
              update: { displayName: p.displayName },
            }),
          ),
          prisma.gameRoom.create({
            data: {
              id: r.roundId,
              code: r.code,
              scenarioId: r.scenarioId,
              scenarioVersion: r.scenarioVersion,
              seed: r.seed,
              players: {
                create: r.players.map((p) => ({
                  playerId: p.id,
                  displayName: p.displayName,
                  joinOrder: p.joinOrder,
                  clueId: p.clueId,
                })),
              },
            },
          }),
        ]),
      );
    },

    tradeExecuted(roundId, playerId, t) {
      queue.push(`trade ${t.id}`, () =>
        prisma.trade.create({
          data: {
            id: t.id,
            roomId: roundId,
            playerId,
            requestId: t.requestId,
            symbol: t.symbol,
            side: t.side,
            quantity: t.quantity,
            price: t.price,
            fee: t.fee,
            total: t.total,
            tick: t.tick,
            createdAt: new Date(t.createdAt),
          },
        }),
      );
    },

    roundFinished(roundId, results) {
      queue.push(`roundFinished ${roundId}`, () =>
        prisma.$transaction([
          prisma.gameRoom.update({
            where: { id: roundId },
            data: {
              status: "FINISHED",
              finishedAt: new Date(),
              results: results as unknown as Prisma.InputJsonValue,
            },
          }),
          prisma.gameResult.createMany({
            data: results.leaderboard.map((r) => ({
              roomId: roundId,
              playerId: r.playerId,
              rank: r.rank,
              portfolioValue: r.portfolioValue,
              pnl: r.pnl,
              returnPct: r.returnPct,
              tradeCount: r.tradeCount,
            })),
          }),
        ]),
      );
    },

    async findResults(code) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
      });
      const query = prisma.gameRoom
        .findFirst({
          where: { code, status: "FINISHED" },
          orderBy: { finishedAt: "desc" },
          select: { results: true },
        })
        .then((row) => (row?.results as unknown as GameResults | null) ?? null)
        .catch((error: unknown) => {
          log(`persistence findResults failed: ${describeError(error)}`);
          return null;
        });
      try {
        return await Promise.race([query, timeout]);
      } finally {
        clearTimeout(timer);
      }
    },

    async close(timeoutMs = 5_000) {
      await queue.drain(timeoutMs);
      await prisma.$disconnect().catch(() => {});
    },
  };
}
