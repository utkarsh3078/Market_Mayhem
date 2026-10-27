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

  /** A read that resolves to `fallback` (logged) on failure, or after READ_TIMEOUT_MS. */
  async function read<T>(name: string, fallback: T, query: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), READ_TIMEOUT_MS);
    });
    const safe = query.catch((error: unknown) => {
      log(`persistence ${name} failed: ${describeError(error)}`);
      return fallback;
    });
    try {
      return await Promise.race([safe, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

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

    findResults(code) {
      return read(
        "findResults",
        null,
        prisma.gameRoom
          .findFirst({
            where: { code, status: "FINISHED" },
            orderBy: { finishedAt: "desc" },
            select: { results: true },
          })
          .then((row) => (row?.results as unknown as GameResults | null) ?? null),
      );
    },

    roundsFinishedSince(since) {
      return read(
        "roundsFinishedSince",
        [],
        prisma.gameRoom
          .findMany({ where: { finishedAt: { gt: since } }, select: { finishedAt: true } })
          .then((rows) => rows.map((r) => r.finishedAt!.getTime())),
      );
    },

    async close(timeoutMs = 5_000) {
      await queue.drain(timeoutMs);
      await prisma.$disconnect().catch(() => {});
    },
  };
}
