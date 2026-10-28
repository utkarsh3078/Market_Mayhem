import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { C2S, S2C } from "../../shared/events";
import type { Ack, GameResults, RoomState, Session } from "../../shared/types";
import { AI_SCENARIO_ID, type AcquiredScenario, type AiScenarios } from "../ai/services";
import { createGameServer } from "../app";
import type { Persistence, RoundStartRecord } from "../persistence/types";
import { energyShock } from "../scenarios/energyShock";
import type { ScenarioConfig } from "../scenarios/types";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const until = async (condition: () => boolean, label: string) => {
  for (let i = 0; i < 400; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for: ${label}`);
};

/** A fake AI layer whose scenarios are released by the test, one step at a time. */
function makeAi(options: { enabled?: boolean } = {}) {
  const acquires: { theme?: string; pending: Deferred<AcquiredScenario> }[] = [];
  const released: ScenarioConfig[] = [];
  const ai: AiScenarios = {
    enabled: options.enabled ?? true,
    acquire(theme) {
      const pending = deferred<AcquiredScenario>();
      acquires.push({ theme, pending });
      return pending.promise;
    },
    release: (scenario) => released.push(scenario),
  };
  return { ai, acquires, released };
}

function generated(id: string): ScenarioConfig {
  return {
    ...structuredClone(energyShock),
    id,
    name: `Generated ${id}`,
    teaser: "Ships idle off the coast and nobody is sure why.",
    seed: `${id}-seed`,
  };
}

/** Records what would be written to the database. */
function recorder() {
  const started: RoundStartRecord[] = [];
  const persistence: Persistence = {
    roundStarted: (record) => void started.push(record),
    tradeExecuted: () => {},
    roundFinished: () => {},
    findResults: async () => null,
    roundsFinishedSince: async () => [],
    close: async () => {},
  };
  return { persistence, started };
}

const sockets: Socket[] = [];

function harness(ai: AiScenarios, persistence?: Persistence) {
  const server = createGameServer({ timings: { startingMs: 60, tickMs: 4, resolvingMs: 30 }, ai, persistence });
  let url = "";
  return {
    async open() {
      await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
      url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
    },
    close: () => server.close(),
    client() {
      const socket = connect(url, { transports: ["websocket"], forceNew: true });
      sockets.push(socket);
      return new Promise<{ socket: Socket; session: Session }>((resolve) =>
        socket.once(S2C.SESSION, (session: Session) => resolve({ socket, session })),
      );
    },
  };
}

function call<T>(socket: Socket, event: string, payload: unknown = {}): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Tracks the latest room state a socket has seen. */
function watch(socket: Socket) {
  const box: { room: RoomState | null; finished: GameResults | null } = { room: null, finished: null };
  socket.on(S2C.ROOM_STATE, (room: RoomState) => {
    box.room = room;
  });
  socket.on(S2C.GAME_FINISHED, (results: GameResults) => {
    box.finished = results;
  });
  return box;
}

after(() => {
  for (const s of sockets) s.disconnect();
});

describe("AI scenario mode", () => {
  const fake = makeAi();
  const db = recorder();
  const app = harness(fake.ai, db.persistence);
  before(() => app.open());
  after(() => app.close());

  it("offers the AI scenario and keeps the story hidden until the round ends", async () => {
    const host = await app.client();
    const view = watch(host.socket);
    const created = await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    assert.ok(created.ok);
    const listing = created.data.scenarios.find((s) => s.kind === "ai");
    assert.equal(listing?.id, AI_SCENARIO_ID);
    assert.deepEqual(created.data.ai, { enabled: true, selected: false, generating: false, source: null });

    // Picking it starts generation and blocks the round until Gemma is done.
    assert.ok((await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID, theme: "a port strike" })).ok);
    await until(() => fake.acquires.length === 1, "scenario requested");
    assert.equal(fake.acquires[0].theme, "a port strike");
    await until(() => view.room?.ai.generating === true, "generating flag");
    assert.equal(view.room?.ai.selected, true);
    const early = await call(host.socket, C2S.GAME_START);
    assert.ok(!early.ok);
    assert.equal(!early.ok && early.error.code, "SCENARIO_PENDING");

    // Gemma delivers: the public state shows only the safe summary.
    fake.acquires[0].pending.resolve({ scenario: generated("ai-one"), source: "gemma" });
    await until(() => view.room?.ai.generating === false, "generation finished");
    assert.equal(view.room?.ai.source, "gemma");
    assert.deepEqual(Object.keys(view.room!.scenario).sort(), ["id", "name", "seed", "teaser"]);
    assert.equal(view.room?.scenario.id, "ai-one");
    const publicJson = JSON.stringify(view.room);
    assert.ok(!publicJson.includes(energyShock.resolution.headline), "the reveal headline is not leaked");
    assert.ok(!publicJson.includes(energyShock.clues[0].content), "clue text is not leaked");

    // Play the round; the AI scenario itself is stored so the round can be replayed.
    assert.ok((await call(host.socket, C2S.GAME_START)).ok);
    await until(() => view.finished !== null, "round finished");
    assert.equal(db.started.at(-1)?.scenarioConfig?.id, "ai-one");
    assert.equal(db.started.at(-1)?.scenarioId, "ai-one");
  });

  it("writes a fresh scenario for the next round", async () => {
    const host = await app.client();
    const view = watch(host.socket);
    await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    const before = fake.acquires.length;
    await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID });
    await until(() => fake.acquires.length === before + 1, "first request");
    fake.acquires[before].pending.resolve({ scenario: generated("ai-first"), source: "gemma" });
    await until(() => view.room?.scenario.id === "ai-first", "first scenario applied");

    assert.ok((await call(host.socket, C2S.GAME_START)).ok);
    await until(() => view.finished !== null, "round finished");
    assert.ok((await call(host.socket, C2S.GAME_RESET)).ok);
    await until(() => fake.acquires.length === before + 2, "scenario requested again after reset");
    await until(() => view.room?.status === "LOBBY" && view.room.ai.generating, "lobby is generating again");
    assert.equal(view.room?.results, null);
    fake.acquires[before + 1].pending.resolve({ scenario: generated("ai-second"), source: "gemma" });
    await until(() => view.room?.scenario.id === "ai-second", "second scenario applied");
  });

  it("lets a built-in pick cancel a pending AI scenario and returns the unused one", async () => {
    const host = await app.client();
    const view = watch(host.socket);
    await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    const mark = fake.acquires.length;
    await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID });
    await until(() => fake.acquires.length === mark + 1, "requested");
    assert.ok((await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: "rate-shock" })).ok);
    await until(() => view.room?.scenario.id === "rate-shock", "built-in applied");
    assert.equal(view.room?.ai.generating, false);
    assert.equal(view.room?.ai.selected, false);

    const late = generated("ai-late");
    fake.acquires[mark].pending.resolve({ scenario: late, source: "gemma" });
    await until(() => fake.released.some((s) => s.id === "ai-late"), "late scenario handed back");
    assert.equal(view.room?.scenario.id, "rate-shock", "the late scenario is not applied");
    assert.ok((await call(host.socket, C2S.GAME_START)).ok, "the room can start with the built-in scenario");
  });

  it("falls back to a built-in scenario and says so", async () => {
    const host = await app.client();
    const view = watch(host.socket);
    await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    const mark = fake.acquires.length;
    await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID });
    await until(() => fake.acquires.length === mark + 1, "requested");
    fake.acquires[mark].pending.resolve({ scenario: structuredClone(energyShock), source: "fallback" });
    await until(() => view.room?.ai.source === "fallback", "fallback flagged");
    assert.equal(view.room?.scenario.id, "energy-shock");
    assert.equal(view.room?.ai.generating, false);

    // A fallback is a built-in scenario, so nothing AI-specific is stored for it.
    assert.ok((await call(host.socket, C2S.GAME_START)).ok);
    await until(() => view.finished !== null, "round finished");
    assert.equal(db.started.at(-1)?.scenarioConfig, undefined);
  });

  it("survives the AI layer rejecting outright", async () => {
    const host = await app.client();
    const view = watch(host.socket);
    await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    const mark = fake.acquires.length;
    await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID });
    await until(() => fake.acquires.length === mark + 1, "requested");
    fake.acquires[mark].pending.reject(new Error("boom"));
    await until(() => view.room?.ai.generating === false, "generation ended");
    assert.equal(view.room?.ai.source, "fallback");
    assert.ok((await call(host.socket, C2S.GAME_START)).ok, "the room still starts");
  });

  it("only lets the host pick the AI scenario", async () => {
    const host = await app.client();
    const guest = await app.client();
    const created = await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    assert.ok(created.ok);
    await call(guest.socket, C2S.ROOM_JOIN, { roomCode: created.data.code, displayName: "Guest" });
    const res = await call(guest.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID });
    assert.ok(!res.ok);
    assert.equal(!res.ok && res.error.code, "NOT_HOST");
  });

  it("rejects an over-long theme", async () => {
    const host = await app.client();
    await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    const res = await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID, theme: "x".repeat(200) });
    assert.ok(!res.ok);
  });
});

describe("without Gemma configured", () => {
  const app = harness(makeAi({ enabled: false }).ai);
  before(() => app.open());
  after(() => app.close());

  it("hides the AI scenario and refuses it", async () => {
    const host = await app.client();
    const view = watch(host.socket);
    const created = await call<RoomState>(host.socket, C2S.ROOM_CREATE, { displayName: "Host" });
    assert.ok(created.ok);
    assert.ok(!created.data.scenarios.some((s) => s.kind === "ai"));
    assert.equal(created.data.ai.enabled, false);
    const res = await call(host.socket, C2S.ROOM_SCENARIO, { scenarioId: AI_SCENARIO_ID });
    assert.ok(!res.ok);
    assert.equal(!res.ok && res.error.code, "UNKNOWN_SCENARIO");

    assert.ok((await call(host.socket, C2S.GAME_START)).ok);
    await until(() => view.finished !== null, "round finished");
  });
});