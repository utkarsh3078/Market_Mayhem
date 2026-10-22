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
