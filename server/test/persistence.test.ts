import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { C2S, S2C } from "../../shared/events";
import type { Ack, GameResults, RoomState, TradeRecord, TradeResultPayload } from "../../shared/types";
import { createGameServer } from "../app";
import { pgPoolConfig } from "../persistence/connection";
import { describeError, WriteQueue } from "../persistence/queue";
import type { Persistence, RoundStartRecord } from "../persistence/types";

const TIMINGS = { startingMs: 60, tickMs: 8, resolvingMs: 20 };
const sockets: Socket[] = [];
// Servers still open after their test (e.g. an assertion failed before `stop`) would keep the
// process alive and hang the run, so close them all at the end.
const openServers = new Set<ReturnType<typeof createGameServer>>();
const stop = async (server: ReturnType<typeof createGameServer>) => {
  if (openServers.delete(server)) await server.close();
};
after(async () => {
  sockets.forEach((s) => s.disconnect());
  for (const server of [...openServers]) await stop(server);
});

async function start(persistence: Persistence) {
  const logs: string[] = [];
  const server = createGameServer({ timings: TIMINGS, persistence, log: (m) => logs.push(m) });
  openServers.add(server);
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
  return { server, url, logs };
}

function client(url: string): Promise<Socket> {
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  return new Promise((resolve) => socket.once(S2C.SESSION, () => resolve(socket)));
}

function call<T>(socket: Socket, event: string, payload: unknown = {}): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Create a room, play one buy, and wait for the results. */
async function playRound(url: string): Promise<{ code: string; results: GameResults; trade: TradeResultPayload }> {
  const host = await client(url);
  const created = await call<RoomState>(host, C2S.ROOM_CREATE, { displayName: "Ada" });
  assert.ok(created.ok);
  const active = new Promise<RoomState>((resolve) =>
    host.on(S2C.ROOM_STATE, (s: RoomState) => s.status === "ACTIVE" && resolve(s)),
  );
  const finished = new Promise<GameResults>((resolve) => host.once(S2C.GAME_FINISHED, resolve));
  assert.ok((await call(host, C2S.GAME_START)).ok);
  const { roundId } = await active;
  const trade = await new Promise<TradeResultPayload>((resolve) => {
    host.once(S2C.TRADE_RESULT, resolve);
    host.emit(C2S.TRADE_SUBMIT, { roundId, requestId: "persist-0001", symbol: "AGR", side: "BUY", quantity: 3 });
  });
  return { code: created.data.code, results: await finished, trade };
}

describe("WriteQueue", () => {
  it("runs jobs in order, logs failures and keeps going", async () => {
    const logs: string[] = [];
    const queue = new WriteQueue((m) => logs.push(m));
    const order: number[] = [];
    queue.push("one", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    queue.push("two", async () => {
      throw new Error("db down");
    });
    queue.push("three", () => {
      throw new Error("sync throw");
    });
    queue.push("four", async () => order.push(4));
    assert.equal(queue.size, 4, "push returns before any job runs");
    await queue.drain();
    assert.deepEqual(order, [1, 4]);
    assert.deepEqual(logs, ["persistence two failed: db down", "persistence three failed: sync throw"]);
    assert.equal(queue.size, 0);
  });

  it("drops new jobs when the backlog is full", async () => {
    const logs: string[] = [];
    const queue = new WriteQueue((m) => logs.push(m), 2);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    queue.push("a", () => gate);
    queue.push("b", async () => {});
    queue.push("c", async () => {});
    assert.equal(queue.size, 2);
    assert.match(logs[0], /dropped c/);
    release();
    await queue.drain();
  });

  it("describes errors on one line and keeps driver error codes", () => {
    const prismaLike = Object.assign(new Error("\nInvalid `prisma.trade.create()` invocation:\n\n\n"), {
      code: "ECONNREFUSED",
    });
    assert.equal(describeError(prismaLike), "Invalid `prisma.trade.create()` invocation: (ECONNREFUSED)");
    assert.equal(describeError(new Error("db down")), "db down");
    assert.equal(describeError("plain"), "plain");
  });

  it("drain gives up after its timeout", async () => {
    const queue = new WriteQueue(() => {});
    queue.push("stuck", () => new Promise(() => {}));
    const started = Date.now();
    await queue.drain(30);
    assert.ok(Date.now() - started < 1_000);
  });
});

describe("persistence in the game loop", () => {
  it("completes a round when every persistence call throws", async () => {
    const boom = () => {
      throw new Error("database unavailable");
    };
    const { server, url } = await start({
      roundStarted: boom,
      tradeExecuted: boom,
      roundFinished: boom,
      findResults: async () => boom(),
      roundsFinishedSince: async () => [],
      close: async () => {},
    });
    const { trade, results } = await playRound(url);
    assert.ok(trade.ok, "trading still works");
    assert.equal(results.leaderboard.length, 1);
    await stop(server);
  });

  it("completes a round while a queued backend rejects every write", async () => {
    const logs: string[] = [];
    const queue = new WriteQueue((m) => logs.push(m));
    const failing = () => queue.push("write", async () => Promise.reject(new Error("connection refused")));
    const { server, url } = await start({
      roundStarted: failing,
      tradeExecuted: failing,
      roundFinished: failing,
      findResults: async () => null,
      roundsFinishedSince: async () => [],
      close: () => queue.drain(),
    });
    const { trade, results } = await playRound(url);
    assert.ok(trade.ok);
    assert.equal(results.leaderboard[0].tradeCount, 1);
    await stop(server);
    assert.equal(logs.length, 3, "round start, trade and finish each failed and were logged");
  });

  it("records the round, its trades and its results after each in-memory commit", async () => {
    const started: RoundStartRecord[] = [];
    const trades: { roundId: string; playerId: string; trade: TradeRecord }[] = [];
    const finished: { roundId: string; results: GameResults }[] = [];
    const { server, url } = await start({
      roundStarted: (r) => started.push(r),
      tradeExecuted: (roundId, playerId, trade) => trades.push({ roundId, playerId, trade }),
      roundFinished: (roundId, results) => finished.push({ roundId, results }),
      findResults: async () => null,
      roundsFinishedSince: async () => [],
      close: async () => {},
    });
    const { code, trade, results } = await playRound(url);
    assert.ok(trade.ok);

    assert.equal(started.length, 1);
    assert.equal(started[0].code, code);
    assert.equal(started[0].scenarioId, "energy-shock");
    assert.equal(started[0].players.length, 1);
    assert.ok(started[0].players[0].clueId, "the assigned clue is recorded");

    assert.equal(trades.length, 1);
    assert.equal(trades[0].roundId, started[0].roundId);
    assert.deepEqual(trades[0].trade, trade.trade);

    assert.equal(finished.length, 1);
    assert.equal(finished[0].roundId, started[0].roundId);
    assert.deepEqual(finished[0].results, results);
    await stop(server);
  });
});

describe("GET /api/rooms/:code/results", () => {
  it("falls back to stored results once a room has left memory", async () => {
    const stored = { roundId: "r1", leaderboard: [], reveal: { headline: "Saved", summary: "", assets: [], lessons: [] } };
    const { server, url } = await start({
      roundStarted: () => {},
      tradeExecuted: () => {},
      roundFinished: () => {},
      findResults: async (code) => (code === "QQQQQ" ? stored : null),
      roundsFinishedSince: async () => [],
      close: async () => {},
    });
    const hit = await fetch(`${url}/api/rooms/qqqqq/results`);
    assert.equal(hit.status, 200);
    assert.deepEqual(((await hit.json()) as { results: unknown }).results, stored);
    assert.equal((await fetch(`${url}/api/rooms/WWWWW/results`)).status, 404);
    assert.equal((await fetch(`${url}/api/rooms/not-a-code/results`)).status, 404);
    await stop(server);
  });

  it("returns 404 rather than failing when the lookup throws", async () => {
    const { server, url } = await start({
      roundStarted: () => {},
      tradeExecuted: () => {},
      roundFinished: () => {},
      findResults: async () => {
        throw new Error("db down");
      },
      roundsFinishedSince: async () => [],
      close: async () => {},
    });
    assert.equal((await fetch(`${url}/api/rooms/QQQQQ/results`)).status, 404);
    await stop(server);
  });
});

describe("pgPoolConfig", () => {
  const url = "postgresql://postgres.ref:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require";

  it("uses the URL as-is without a CA certificate", () => {
    const config = pgPoolConfig(url);
    assert.equal(config.connectionString, url);
    assert.equal(config.ssl, undefined);
  });

  it("verifies against the given CA and drops URL SSL params that would override it", () => {
    const config = pgPoolConfig(url, "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----");
    assert.ok(!config.connectionString!.includes("sslmode"));
    assert.ok(config.connectionString!.startsWith("postgresql://postgres.ref:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"));
    assert.deepEqual(config.ssl, {
      ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });
});
