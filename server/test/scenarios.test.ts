import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { C2S, S2C } from "../../shared/events";
import type { Ack, GameResults, PrivateClue, RoomState, Session } from "../../shared/types";
import { createGameServer } from "../app";
import { scenarioContractErrors } from "../scenarios/contract";
import { energyShock } from "../scenarios/energyShock";
import { DEFAULT_SCENARIO_ID, PUBLIC_SCENARIOS, SCENARIOS } from "../scenarios";
import type { ScenarioConfig } from "../scenarios/types";

const clone = (s: ScenarioConfig): ScenarioConfig => structuredClone(s);

describe("scenario contract", () => {
  for (const scenario of SCENARIOS.values()) {
    it(`${scenario.id} satisfies the contract`, () => {
      assert.deepEqual(scenarioContractErrors(scenario), []);
    });
  }

  it("has unique seeds and a registered default", () => {
    const seeds = [...SCENARIOS.values()].map((s) => s.seed);
    assert.equal(new Set(seeds).size, seeds.length);
    assert.ok(SCENARIOS.has(DEFAULT_SCENARIO_ID));
  });

  it("public listing carries no hidden fields", () => {
    for (const listing of PUBLIC_SCENARIOS) {
      assert.deepEqual(Object.keys(listing).sort(), ["id", "name", "teaser"]);
    }
  });

  it("rejects scenarios that break the contract", () => {
    const cases: [string, (s: ScenarioConfig) => void][] = [
      ["kebab-case", (s) => (s.id = "Not Kebab")],
      ["totalTicks", (s) => (s.totalTicks = 60)],
      ["events", (s) => (s.events = s.events.slice(0, 3))],
      ["|perTick|", (s) => (s.events[0].perTick.NVE = 0.02)],
      ["startTick", (s) => (s.events[0].endTick = s.events[0].startTick)],
      ["news items", (s) => (s.news = s.news.slice(0, 4))],
      ["by tick", (s) => (s.news = s.news.map((n) => ({ ...n, tick: Math.max(n.tick, 10) })))],
      ["news ids", (s) => (s.news[1].id = s.news[0].id)],
      ["exactly 5 clues", (s) => s.clues.pop()],
      ["LOW-confidence", (s) => s.clues.forEach((c) => c.confidence === "LOW" && (c.confidence = "MEDIUM"))],
      ["empty field", (s) => (s.clues[0].hint = " ")],
      ["|shock|", (s) => (s.resolution.shock.AGR = 0.5)],
      ["explanations missing", (s) => (s.resolution.explanations.MTB = "")],
      ["lessons", (s) => (s.resolution.lessons = ["only one"])],
    ];
    for (const [expected, mutate] of cases) {
      const broken = clone(energyShock);
      mutate(broken);
      const errors = scenarioContractErrors(broken);
      assert.ok(
        errors.some((e) => e.includes(expected)),
        `expected a "${expected}" violation, got: ${JSON.stringify(errors)}`,
      );
    }
  });
});

// ---------- multi-scenario rooms over real sockets ----------

const altScenario: ScenarioConfig = {
  ...clone(energyShock),
  id: "test-alt",
  name: "Test Alt",
  teaser: "A second scenario used only by this test.",
  seed: "test-alt-seed",
  clues: energyShock.clues.map((c) => ({ ...c, id: `alt-${c.id}`, title: `ALT ${c.title}` })),
  resolution: { ...clone(energyShock).resolution, headline: "ALT RESOLUTION HEADLINE" },
};

const server = createGameServer({
  timings: { startingMs: 100, tickMs: 10, resolvingMs: 30 },
  scenarios: [energyShock, altScenario],
});
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

/** A client that records every frame it receives, to prove what it can and can't see. */
async function client(): Promise<{ socket: Socket; session: Session; frames: string[] }> {
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  const frames: string[] = [];
  socket.onAny((event: string, payload: unknown) => frames.push(`${event} ${JSON.stringify(payload)}`));
  const session = await new Promise<Session>((resolve) => socket.once(S2C.SESSION, resolve));
  return { socket, session, frames };
}

function call<T>(socket: Socket, event: string, payload: unknown = {}): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function next<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

const errorCode = (ack: Ack<unknown>) => (!ack.ok ? ack.error.code : null);

describe("multi-scenario rooms", () => {
  it("lets two rooms run different scenarios at once without leaking hidden data", async () => {
    const alice = await client();
    const bob = await client();
    const carol = await client();

    const roomA = await call<RoomState>(alice.socket, C2S.ROOM_CREATE, { displayName: "Alice" });
    const roomB = await call<RoomState>(carol.socket, C2S.ROOM_CREATE, { displayName: "Carol" });
    assert.ok(roomA.ok && roomB.ok);
    assert.equal(roomA.data.scenario.id, energyShock.id, "new rooms use the default scenario");
    assert.deepEqual(
      roomA.data.scenarios.map((s) => s.id),
      [energyShock.id, altScenario.id],
    );
    await call(bob.socket, C2S.ROOM_JOIN, { roomCode: roomA.data.code, displayName: "Bob" });

    // Only the host picks, and only registered ids.
    assert.equal(errorCode(await call(bob.socket, C2S.ROOM_SCENARIO, { scenarioId: altScenario.id })), "NOT_HOST");
    assert.equal(errorCode(await call(carol.socket, C2S.ROOM_SCENARIO, { scenarioId: "nope" })), "UNKNOWN_SCENARIO");
    assert.equal(errorCode(await call(carol.socket, C2S.GAME_START, { scenarioId: "nope" })), "UNKNOWN_SCENARIO");
    assert.equal(errorCode(await call(carol.socket, C2S.ROOM_SCENARIO, {})), "INVALID_PAYLOAD");

    const picked = await call(carol.socket, C2S.ROOM_SCENARIO, { scenarioId: altScenario.id });
    assert.ok(picked.ok);
    const state = await call<RoomState>(carol.socket, C2S.ROOM_JOIN, { roomCode: roomB.data.code, displayName: "Carol" });
    assert.ok(state.ok);
    assert.equal(state.data.scenario.id, altScenario.id);

    // Lobby payloads contain no clue, news or resolution text.
    const lobbyFrames = [...alice.frames, ...bob.frames, ...carol.frames].join("\n");
    for (const s of [energyShock, altScenario]) {
      for (const secret of [s.resolution.headline, ...s.clues.map((c) => c.content), ...s.news.map((n) => n.headline)]) {
        assert.ok(!lobbyFrames.includes(secret), `lobby leaked: ${secret}`);
      }
    }

    const aliceClue = next<PrivateClue>(alice.socket, S2C.CLUE_PRIVATE);
    const carolClue = next<PrivateClue>(carol.socket, S2C.CLUE_PRIVATE);
    const finishedA = next<GameResults>(alice.socket, S2C.GAME_FINISHED);
    const finishedB = next<GameResults>(carol.socket, S2C.GAME_FINISHED);
    assert.ok((await call(alice.socket, C2S.GAME_START)).ok);
    // game:start can also carry the choice directly.
    assert.ok((await call(carol.socket, C2S.GAME_START, { scenarioId: altScenario.id })).ok);

    const [clueA, clueB] = await Promise.all([aliceClue, carolClue]);
    assert.ok(energyShock.clues.some((c) => c.id === clueA.id));
    assert.ok(altScenario.clues.some((c) => c.id === clueB.id));
    assert.equal(errorCode(await call(carol.socket, C2S.ROOM_SCENARIO, { scenarioId: energyShock.id })), "ROUND_IN_PROGRESS");

    assert.equal((await finishedA).reveal.headline, energyShock.resolution.headline);
    assert.equal((await finishedB).reveal.headline, altScenario.resolution.headline);

    // Bob shares Alice's room but never sees her clue until the final "who knew what" reveal.
    const beforeReveal = bob.frames.filter((f) => !f.includes('"reveal":'));
    assert.ok(beforeReveal.some((f) => f.startsWith(S2C.CLUE_PRIVATE)), "bob got his own clue");
    assert.ok(!beforeReveal.join("\n").includes(clueA.content), "another player's clue leaked mid-round");
  });
});
