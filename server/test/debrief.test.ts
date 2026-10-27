import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";
import { C2S, S2C } from "../../shared/events";
import type { Ack, GameResults, RoomState } from "../../shared/types";
import { buildFactSheet, factsToPrompt, unsupportedNumbers, writeDebrief, type DebriefGenerator, type FactSheet } from "../ai/debrief";
import { createGameServer } from "../app";

const facts: FactSheet = {
  scenario: "The Energy Shock",
  outcome: { headline: "The shortage never came", summary: "A backup route was secured." },
  assets: [{ symbol: "NVE", name: "Nova Energy", open: 120, final: 106.86, changePct: -10.95 }],
  players: [
    { name: "Ada", rank: 1, pnlCredits: 7923, returnPct: 7.92, trades: 2, clue: { title: "Strong harvest", confidence: "HIGH" } },
    { name: "Grace", rank: 2, pnlCredits: -1270, returnPct: -1.27, trades: 1, clue: null },
  ],
  topTrades: [{ player: "Ada", side: "BUY", quantity: 1538, symbol: "AGR", price: 65.01, tick: 1 }],
};

describe("unsupportedNumbers", () => {
  it("accepts numbers from the fact sheet, rounded or with separators, and small counts", () => {
    const text =
      "Ada finished #1 of two players with 7,923 credits (7.92%, or about 7.9%). Nova Energy fell 10.95% to 106.86 after opening at 120. She bought 1538 AGR at 65.01 on tick 1.";
    assert.deepEqual(unsupportedNumbers(text, facts), []);
  });

  it("flags invented figures, including small invented percentages", () => {
    assert.deepEqual(unsupportedNumbers("Ada earned 9,999 credits, a 3% gain.", facts), ["9,999", "3"]);
    assert.deepEqual(unsupportedNumbers("The gap between them was 9193 credits.", facts), ["9193"]);
  });
});

describe("factsToPrompt", () => {
  it("only contains numbers the summary is allowed to repeat", () => {
    assert.deepEqual(unsupportedNumbers(factsToPrompt(facts), facts), []);
  });

  it("is much smaller than the JSON fact sheet (fewer tokens per call)", () => {
    const prompt = factsToPrompt(facts);
    assert.ok(prompt.length < JSON.stringify(facts, null, 2).length * 0.5, `prompt is ${prompt.length} chars`);
    assert.match(prompt, /1\. Ada \+7923 credits \(\+7\.92%\), clue "Strong harvest" HIGH/);
  });
});

describe("buildFactSheet", () => {
  it("turns results into rounded, human-scale facts and keeps the three largest trades", () => {
    const results: GameResults = {
      roundId: "r1",
      leaderboard: [
        {
          playerId: "p1", displayName: "Ada", portfolioValue: 10_792_300, pnl: 792_300, returnPct: 7.923, rank: 1,
          tradeCount: 4, clueTitle: "Strong harvest", clueContent: "…", clueConfidence: "HIGH",
        },
      ],
      reveal: {
        headline: "H", summary: "S", lessons: [],
        assets: [{ symbol: "AGR", openPrice: 6500, peakPrice: 7200, troughPrice: 6100, finalPrice: 7036, changePct: 8.246, explanation: "" }],
      },
    };
    const trade = (id: string, quantity: number, price: number) => ({
      id, requestId: id, symbol: "AGR" as const, side: "BUY" as const, quantity, price, fee: 0, total: 0, tick: 3, createdAt: 0,
    });
    const sheet = buildFactSheet("The Energy Shock", results, new Map([["p1", [trade("a", 1, 100), trade("b", 500, 6500), trade("c", 10, 6500), trade("d", 100, 6600)]]]));
    assert.deepEqual(sheet.players[0], { name: "Ada", rank: 1, pnlCredits: 7923, returnPct: 7.92, trades: 4, clue: { title: "Strong harvest", confidence: "HIGH" } });
    assert.deepEqual(sheet.assets[0], { symbol: "AGR", name: "AgriCore", open: 65, final: 70.36, changePct: 8.25 });
    assert.deepEqual(sheet.topTrades.map((t) => t.quantity), [500, 100, 10]);
  });
});

describe("writeDebrief", () => {
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);

  it("returns the text when every number checks out", async () => {
    assert.equal(await writeDebrief(async () => "Ada won with 7.92%.", facts, log), "Ada won with 7.92%.");
  });

  it("falls back (null) when the model invents a number, errors, or is too slow", async () => {
    assert.equal(await writeDebrief(async () => "Ada won with 12.5%.", facts, log), null);
    assert.equal(await writeDebrief(async () => Promise.reject(new Error("overloaded")), facts, log), null);
    const started = Date.now();
    assert.equal(await writeDebrief(() => new Promise(() => {}), facts, log, 50), null);
    assert.ok(Date.now() - started < 1_000);
    assert.ok(logs.some((m) => m.includes("discarded")) && logs.some((m) => m.includes("overloaded")) && logs.some((m) => m.includes("timed out")));
  });
});

// ---------- end to end over sockets ----------

const sockets: Socket[] = [];
after(() => sockets.forEach((s) => s.disconnect()));

async function playRound(debrief?: DebriefGenerator) {
  const server = createGameServer({ timings: { startingMs: 60, tickMs: 8, resolvingMs: 20 }, debrief });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  await new Promise((resolve) => socket.once(S2C.SESSION, resolve));
  const states: RoomState[] = [];
  socket.on(S2C.ROOM_STATE, (s: RoomState) => states.push(s));
  const created = await new Promise<Ack<RoomState>>((resolve) => socket.emit(C2S.ROOM_CREATE, { displayName: "Ada" }, resolve));
  assert.ok(created.ok);
  const finished = new Promise<GameResults>((resolve) => socket.once(S2C.GAME_FINISHED, resolve));
  socket.emit(C2S.GAME_START, {}, () => {});
  return { server, states, finished: await finished };
}

const until = async (check: () => boolean, ms = 2_000) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("AI summary in a round", () => {
  it("sends results immediately, then the summary once it is written", async () => {
    let factsSeen: FactSheet | null = null;
    const slow: DebriefGenerator = async (f) => {
      factsSeen = f;
      await new Promise((r) => setTimeout(r, 150));
      return `${f.players[0].name} finished first.`;
    };
    const { server, states, finished } = await playRound(slow);
    assert.deepEqual(finished.aiSummary, { status: "pending" }, "results don't wait for the AI");
    await until(() => states.some((s) => s.results?.aiSummary?.status === "ready"));
    const ready = states.find((s) => s.results?.aiSummary?.status === "ready")!.results!;
    assert.deepEqual(ready.aiSummary, { status: "ready", text: "Ada finished first." });
    assert.deepEqual(ready.leaderboard, finished.leaderboard, "the summary never changes the results");
    assert.equal(factsSeen!.players[0].name, "Ada");
    await server.close();
  });

  it("marks the summary unavailable when generation fails, and the round still completes", async () => {
    const { server, states, finished } = await playRound(async () => {
      throw new Error("API down");
    });
    assert.equal(finished.leaderboard.length, 1);
    await until(() => states.some((s) => s.results?.aiSummary?.status === "unavailable"));
    await server.close();
  });

  it("leaves the summary out entirely when the feature is off", async () => {
    const { server, finished } = await playRound();
    assert.equal(finished.aiSummary, undefined);
    await server.close();
  });
});
