import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { C2S, S2C } from "../../shared/events";
import type {
  Ack,
  GameResults,
  PrivateClue,
  RoomState,
  Session,
  TradeResultPayload,
} from "../../shared/types";
import { createGameServer } from "../app";

// A full round over real sockets with compressed timings (90 ticks × 15ms).
const server = createGameServer({ timings: { startingMs: 150, tickMs: 15, resolvingMs: 50 } });
let url = "";
const sockets: Socket[] = [];

before(async () => {
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  for (const s of sockets) s.disconnect();
  await server.close();
});

function client(token?: string): Promise<{ socket: Socket; session: Session }> {
  const socket = connect(url, { auth: { token }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  return new Promise((resolve) => socket.once(S2C.SESSION, (session: Session) => resolve({ socket, session })));
}

function call<T>(socket: Socket, event: string, payload: unknown = {}): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function next<T>(socket: Socket, event: string, predicate: (p: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve) => {
    const handler = (payload: T) => {
      if (predicate(payload)) {
        socket.off(event, handler);
        resolve(payload);
      }
    };
    socket.on(event, handler);
  });
}

function trade(socket: Socket, payload: Record<string, unknown>): Promise<TradeResultPayload> {
  const result = next<TradeResultPayload>(socket, S2C.TRADE_RESULT, (r) => r.requestId === payload.requestId);
  socket.emit(C2S.TRADE_SUBMIT, payload);
  return result;
}

describe("multiplayer round", () => {
  it("runs create → join → clues → trade → resolve → results", async () => {
    const alice = await client();
    const bob = await client();
    const eve = await client(); // never joins; must not receive clues

    const created = await call<RoomState>(alice.socket, C2S.ROOM_CREATE, { displayName: "Alice" });
    assert.ok(created.ok);
    const code = created.data.code;

    const unknown = await call<RoomState>(bob.socket, C2S.ROOM_JOIN, { roomCode: "ZZZZZ", displayName: "Bob" });
    assert.equal(!unknown.ok && unknown.error.code, "ROOM_NOT_FOUND");

    const joined = await call<RoomState>(bob.socket, C2S.ROOM_JOIN, { roomCode: code.toLowerCase(), displayName: "Bob" });
    assert.ok(joined.ok);
    assert.equal(joined.data.players.length, 2);

    const notHost = await call(bob.socket, C2S.GAME_START);
    assert.equal(!notHost.ok && notHost.error.code, "NOT_HOST");

    let eveSawClue = false;
    eve.socket.on(S2C.CLUE_PRIVATE, () => (eveSawClue = true));
    const bobClues: PrivateClue[] = [];
    bob.socket.on(S2C.CLUE_PRIVATE, (c: PrivateClue) => bobClues.push(c));

    const aliceClue = next<PrivateClue>(alice.socket, S2C.CLUE_PRIVATE);
    const active = next<RoomState>(alice.socket, S2C.ROOM_STATE, (s) => s.status === "ACTIVE");
    const started = await call(alice.socket, C2S.GAME_START);
    assert.ok(started.ok);

    const clueA = await aliceClue;
    const state = await active;
    const roundId = state.roundId!;
    assert.equal(bobClues.length, 1);
    assert.notEqual(clueA.id, bobClues[0].id, "players receive different private clues");

    const late = await client();
    const lateJoin = await call(late.socket, C2S.ROOM_JOIN, { roomCode: code, displayName: "Late" });
    assert.equal(!lateJoin.ok && lateJoin.error.code, "ROUND_IN_PROGRESS");

    const buy = await trade(alice.socket, { roundId, requestId: "req-000001", symbol: "NVE", side: "BUY", quantity: 100 });
    assert.ok(buy.ok);
    assert.equal(buy.player.holdings[0].quantity, 100);
    assert.equal(buy.player.cash, 10_000_000 - buy.trade.total);

    const dup = await trade(alice.socket, { roundId, requestId: "req-000001", symbol: "NVE", side: "BUY", quantity: 100 });
    assert.equal(!dup.ok && dup.error.code, "DUPLICATE_REQUEST");

    const broke = await trade(bob.socket, { roundId, requestId: "req-000002", symbol: "CLD", side: "BUY", quantity: 9_999 });
    assert.equal(!broke.ok && broke.error.code, "INSUFFICIENT_CASH");

    const oversell = await trade(bob.socket, { roundId, requestId: "req-000003", symbol: "NVE", side: "SELL", quantity: 1 });
    assert.equal(!oversell.ok && oversell.error.code, "INSUFFICIENT_HOLDINGS");

    for (const quantity of [0, -1, 1.5, 1_000_000]) {
      const bad = await trade(bob.socket, { roundId, requestId: `req-bad-${quantity}`, symbol: "NVE", side: "BUY", quantity });
      assert.equal(!bad.ok && bad.error.code, "INVALID_QUANTITY");
    }

    const stale = await trade(bob.socket, { roundId: "old-round", requestId: "req-000004", symbol: "NVE", side: "BUY", quantity: 1 });
    assert.equal(!stale.ok && stale.error.code, "STALE_ROUND");

    const sneaky = await trade(bob.socket, {
      roundId, requestId: "req-000005", symbol: "NVE", side: "BUY", quantity: 1, price: 1, cash: 999_999_999,
    });
    assert.ok(sneaky.ok, "extra client fields are ignored");
    assert.notEqual(sneaky.trade.price, 1, "server sets the execution price");

    const finished = await next<GameResults>(alice.socket, S2C.GAME_FINISHED);
    assert.equal(finished.leaderboard.length, 2);
    assert.ok(finished.reveal.assets.length === 5);
    const aliceRow = finished.leaderboard.find((r) => r.displayName === "Alice")!;
    assert.equal(aliceRow.pnl, aliceRow.portfolioValue - 10_000_000);
    assert.equal(aliceRow.clueTitle, clueA.title);

    const afterClose = await trade(alice.socket, { roundId, requestId: "req-000006", symbol: "NVE", side: "SELL", quantity: 1 });
    assert.equal(!afterClose.ok && afterClose.error.code, "ROUND_CLOSED");

    const res = await fetch(`${url}/api/rooms/${code}/results`);
    assert.equal(res.status, 200);

    // Reconnect with the same token restores the room.
    alice.socket.disconnect();
    const again = await client(alice.session.token);
    assert.equal(again.session.playerId, alice.session.playerId);
    const snapshot = next<RoomState>(again.socket, S2C.ROOM_STATE, (s) => s?.code === code);
    again.socket.emit(C2S.GAME_REQUEST_STATE);
    const restored = await snapshot;
    assert.equal(restored.status, "FINISHED");
    assert.ok(restored.players.find((p) => p.id === alice.session.playerId)?.isHost, "host survives a refresh");

    const reset = await call(again.socket, C2S.GAME_RESET);
    assert.ok(reset.ok);
    assert.equal(eveSawClue, false, "clues never reach players outside the room");
  });

  it("serves health and assets", async () => {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    const body = (await (await fetch(`${url}/api/assets`)).json()) as { assets: unknown[] };
    assert.equal(body.assets.length, 5);
    assert.equal((await fetch(`${url}/api/rooms/ABCDE`)).status, 404);
  });
});

describe("hardening", () => {
  it("handles a full room of 8 trading at once and closes trading at the bell", async () => {
    const players = await Promise.all(Array.from({ length: 8 }, () => client()));
    const [host, ...rest] = players;
    const created = await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "P0" });
    assert.ok(created.ok);
    const code = created.data.code;
    for (const [i, p] of rest.entries()) {
      assert.ok((await call(p.socket, C2S.ROOM_JOIN, { roomCode: code, displayName: `P${i + 1}` })).ok);
    }
    const ninth = await client();
    const full = await call(ninth.socket, C2S.ROOM_JOIN, { roomCode: code, displayName: "P8" });
    assert.equal(!full.ok && full.error.code, "ROOM_FULL");

    const active = next<RoomState>(host.socket, S2C.ROOM_STATE, (s) => s.status === "ACTIVE");
    const resolving = next<RoomState>(host.socket, S2C.ROOM_STATE, (s) => s.status === "RESOLVING");
    const finished = next<GameResults>(host.socket, S2C.GAME_FINISHED);
    assert.ok((await call(host.socket, C2S.GAME_START)).ok);
    const roundId = (await active).roundId!;

    // Everyone fires the same order twice at the same moment (a duplicate requestId).
    const perPlayer = await Promise.all(
      players.map(
        (p, i) =>
          new Promise<TradeResultPayload[]>((resolve) => {
            const got: TradeResultPayload[] = [];
            const onResult = (r: TradeResultPayload) => {
              got.push(r);
              if (got.length === 2) {
                p.socket.off(S2C.TRADE_RESULT, onResult);
                resolve(got);
              }
            };
            p.socket.on(S2C.TRADE_RESULT, onResult);
            const order = { roundId, requestId: `burst-${i}-0001`, symbol: "CLD", side: "BUY", quantity: 5 };
            p.socket.emit(C2S.TRADE_SUBMIT, order);
            p.socket.emit(C2S.TRADE_SUBMIT, order);
          }),
      ),
    );
    const results = perPlayer.flat();
    assert.equal(results.filter((r) => r.ok).length, 8, "exactly one fill per player");
    assert.equal(results.filter((r) => !r.ok && r.error.code === "DUPLICATE_REQUEST").length, 8);

    await resolving;
    const late = await trade(host.socket, { roundId, requestId: "burst-late-0001", symbol: "CLD", side: "SELL", quantity: 1 });
    assert.equal(!late.ok && late.error.code, "ROUND_CLOSED");

    const final = await finished;
    assert.equal(final.leaderboard.length, 8);
    assert.ok(final.leaderboard.every((r) => r.tradeCount === 1));
  });

  it("rate-limits room creation and joining", async () => {
    const spammer = await client();
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await call<RoomState>(spammer.socket, C2S.ROOM_CREATE, { displayName: "Spam" });
      assert.ok(res.ok);
      codes.push(res.data.code);
    }
    const blocked = await call(spammer.socket, C2S.ROOM_CREATE, { displayName: "Spam" });
    assert.equal(!blocked.ok && blocked.error.code, "RATE_LIMITED");
    const join = await call(spammer.socket, C2S.ROOM_JOIN, { roomCode: codes[0], displayName: "Spam" });
    assert.equal(!join.ok && join.error.code, "RATE_LIMITED");
  });
});

describe("allowed origins", () => {
  const locked = createGameServer({
    clientOrigins: ["https://play.example"],
    timings: { startingMs: 100, tickMs: 10, resolvingMs: 10 },
  });
  let lockedUrl = "";

  before(async () => {
    await new Promise<void>((resolve) => locked.httpServer.listen(0, resolve));
    lockedUrl = `http://localhost:${(locked.httpServer.address() as AddressInfo).port}`;
  });
  after(() => locked.close());

  const attempt = (origin: string) =>
    new Promise<boolean>((resolve) => {
      const socket = connect(lockedUrl, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
        extraHeaders: { Origin: origin },
      });
      socket.once("connect", () => (socket.disconnect(), resolve(true)));
      socket.once("connect_error", () => (socket.disconnect(), resolve(false)));
    });

  it("accepts WebSockets from the configured origin only", async () => {
    assert.equal(await attempt("https://play.example"), true);
    assert.equal(await attempt("https://evil.example"), false);
  });

  it("only sends CORS headers for the configured origin", async () => {
    const good = await fetch(`${lockedUrl}/health`, { headers: { Origin: "https://play.example" } });
    assert.equal(good.headers.get("access-control-allow-origin"), "https://play.example");
    const bad = await fetch(`${lockedUrl}/health`, { headers: { Origin: "https://evil.example" } });
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
  });
});
