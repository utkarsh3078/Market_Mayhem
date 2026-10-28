import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASSET_SYMBOLS } from "../../shared/assets";
import { S2C } from "../../shared/events";
import type { NewsroomBeat, NewsroomPlan, NewsroomSegment } from "../../shared/newsroom";
import type { GameResults } from "../../shared/types";
import { generatePricePath, priceBounds, quotePrice } from "../engine/market";
import { Room, type RoomEmitter, type RoomOptions } from "../game/Room";
import {
  broadcastMoves,
  buildFallbackNewsroomPlan,
  compileNewsroomEvents,
  resolveNewsroomPlan,
  withNewsroom,
} from "../newsroom/plan";
import {
  acceptGeneratedScript,
  createNewsroomScripts,
  fitToSlot,
  slotMs,
  templateScript,
  type ScriptGenerator,
} from "../newsroom/scripts";
import { cleanText, NEWSROOM_RULES, validateNewsroomPlan } from "../newsroom/validate";
import { noopPersistence } from "../persistence/types";
import { createRegistry, SCENARIOS } from "../scenarios";
import { energyShock } from "../scenarios/energyShock";
import type { ScenarioConfig } from "../scenarios/types";

// A second, differently shaped scenario (40 ticks, other assets and categories) proves nothing in the
// newsroom is hardwired to The Energy Shock.
const orchard: ScenarioConfig = {
  ...energyShock,
  id: "test-orchard",
  version: 1,
  name: "Test Orchard",
  seed: "orchard-seed",
  totalTicks: 40,
  events: [{ id: "bloom", startTick: 5, endTick: 15, perTick: { AGR: 0.002 } }],
  news: [{ id: "n1", tick: 4, category: "Agriculture", headline: "Orchards bloom early", body: "Growers report an early bloom." }],
  newsroom: {
    beats: [
      { id: "g1", airTick: 2, kind: "GENERAL", category: "sports", headline: "Rowing club wins the river race", facts: "The club won by two lengths." },
      {
        id: "m1",
        airTick: 8,
        kind: "MARKET",
        category: "shipping",
        clusterId: "port",
        headline: "Port strike stops fuel tankers",
        facts: "Dock workers walked out this morning. Tankers are waiting offshore.",
        effects: [{ symbol: "NVE", driftPerTick: -0.004, reactionDelayTicks: 2, durationTicks: 4 }],
      },
      {
        id: "m2",
        airTick: 11,
        kind: "MARKET",
        category: "energy",
        clusterId: "port",
        headline: "Port strike ends after a quick deal",
        facts: "Unions accepted the offer. Tankers are unloading again.",
        effects: [{ symbol: "NVE", driftPerTick: 0.006, reactionDelayTicks: 2, durationTicks: 5 }],
      },
      { id: "g2", airTick: 20, kind: "GENERAL", category: "culture", headline: "Jazz week opens downtown", facts: "Free concerts run all week." },
      {
        id: "x1",
        airTick: 26,
        kind: "MISLEADING",
        category: "bank",
        headline: "Rumor says MetroBank will be bought",
        facts: "An anonymous post claims a takeover. Nobody has confirmed it.",
        effects: [{ symbol: "MTB", driftPerTick: 0.005, reactionDelayTicks: 1, durationTicks: 6, shape: "SPIKE_REVERT" }],
      },
    ],
  },
};

const clone = <T>(value: T): T => structuredClone(value);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness(scenario: ScenarioConfig, options: RoomOptions = {}, tickMs = 2) {
  const sent: { channel: "room" | "player"; target: string; event: string; payload: unknown }[] = [];
  const emitter: RoomEmitter = {
    toRoom: (target, event, payload) => sent.push({ channel: "room", target, event, payload }),
    toPlayer: (target, event, payload) => sent.push({ channel: "player", target, event, payload }),
  };
  const registry = createRegistry([scenario, ...(scenario === orchard ? [] : [orchard])]);
  const timings = { startingMs: 0, tickMs, resolvingMs: 0 };
  const room = new Room("ROOM1", "host", "Host", registry, scenario.id, timings, emitter, noopPersistence, null, options);
  const segments = () =>
    sent.filter((s) => s.event === S2C.NEWSROOM_SEGMENT).map((s) => s.payload as NewsroomSegment);
  return { room, sent, segments };
}

async function untilFinished(room: Room, limitMs = 5000): Promise<GameResults> {
  const deadline = Date.now() + limitMs;
  while (room.status !== "FINISHED") {
    if (Date.now() > deadline) throw new Error(`round did not finish within ${limitMs} ms`);
    await sleep(5);
  }
  return room.publicState().results!;
}

const planOf = (beats: unknown[]) => ({ beats });
const validate = (plan: unknown, totalTicks = 90) => validateNewsroomPlan(plan, { totalTicks });

describe("validateNewsroomPlan", () => {
  it("accepts every registered scenario's plan (own or fallback) without repairs", () => {
    for (const scenario of SCENARIOS.values()) {
      const plan = scenario.newsroom ?? buildFallbackNewsroomPlan(scenario);
      const result = validate(plan, scenario.totalTicks);
      assert.ok(result.ok, `${scenario.id}: ${!result.ok && result.errors.join("; ")}`);
      assert.deepEqual(result.warnings, [], scenario.id);
    }
  });

  it("gives The Energy Shock the full story mix", () => {
    const beats = resolveNewsroomPlan(energyShock).beats;
    const count = (kind: string) => beats.filter((b) => b.kind === kind).length;
    for (const kind of ["NOISE", "PRICED_IN", "MISLEADING"]) assert.ok(count(kind) >= 1, kind);
    const share = count("GENERAL") / beats.length;
    assert.ok(share >= 0.3 && share <= 0.5, `general share ${share}`);
    const clusters = new Map<string, number>();
    for (const b of beats.filter((x) => x.kind === "MARKET" && x.clusterId)) {
      clusters.set(b.clusterId!, (clusters.get(b.clusterId!) ?? 0) + 1);
    }
    assert.ok([...clusters.values()].some((n) => n >= 2), "at least one back-to-back market cluster");
  });

  it("rejects empty and malformed plans", () => {
    assert.equal(validate({ beats: [] }).ok, false);
    assert.equal(validate(null).ok, false);
    assert.equal(validate({ stories: [] }).ok, false);
    assert.equal(validate(planOf(["not a beat", 42])).ok, false);
  });

  it("drops effects on unknown symbols and beats outside the round", () => {
    const plan = clone(orchard.newsroom!);
    plan.beats[1].effects!.push({ symbol: "ZZZ" as never, driftPerTick: 0.002, reactionDelayTicks: 2, durationTicks: 3 });
    plan.beats.push({ ...plan.beats[0], id: "late", airTick: 39 }, { ...plan.beats[0], id: "early", airTick: 0 });
    const result = validate(plan, 40);
    assert.ok(result.ok);
    assert.equal(result.plan.beats[1].effects!.length, 1);
    assert.ok(!result.plan.beats.some((b) => b.id === "late" || b.id === "early"));
    assert.ok(result.warnings.some((w) => w.includes("unknown symbol ZZZ")));
  });

  it("resolves overlapping beats: filler gives way, market stories are pushed back", () => {
    const plan = clone(orchard.newsroom!);
    plan.beats.push({ ...plan.beats[0], id: "clash", airTick: 8 }); // GENERAL on top of m1
    plan.beats[2].airTick = 9; // m2 one tick after m1
    const result = validate(plan, 40);
    assert.ok(result.ok);
    const ticks = result.plan.beats.map((b) => b.airTick);
    assert.ok(!result.plan.beats.some((b) => b.id === "clash"));
    assert.equal(result.plan.beats.find((b) => b.id === "m2")!.airTick, 8 + NEWSROOM_RULES.minGapTicks);
    ticks.slice(1).forEach((t, i) => assert.ok(t - ticks[i] >= NEWSROOM_RULES.minGapTicks));
  });

  it("clamps oversized drifts, delays and per-asset totals", () => {
    const plan = clone(orchard.newsroom!);
    plan.beats[1].effects = [{ symbol: "NVE", driftPerTick: -0.5, reactionDelayTicks: 0, durationTicks: 99 }];
    const result = validate(plan, 40);
    assert.ok(result.ok);
    const e = result.plan.beats[1].effects![0];
    assert.ok(Math.abs(e.driftPerTick) <= NEWSROOM_RULES.maxDriftPerTick);
    assert.ok(e.reactionDelayTicks >= NEWSROOM_RULES.minReactionTicks);
    assert.ok(Math.abs(e.driftPerTick) * e.durationTicks <= NEWSROOM_RULES.maxMovePerBeat + 1e-9);
    const total = result.plan.beats
      .flatMap((b) => b.effects ?? [])
      .filter((x) => x.symbol === "NVE")
      .reduce((sum, x) => sum + Math.abs(x.driftPerTick) * x.durationTicks, 0);
    assert.ok(total <= NEWSROOM_RULES.maxMovePerAsset + 1e-9);
  });

  it("strips HTML, markdown and emoji, and effects from GENERAL stories", () => {
    const plan = clone(orchard.newsroom!);
    plan.beats[0].headline = "<b>Rowing</b> **club** wins 🚀 [the race](http://x.y)";
    plan.beats[0].effects = [{ symbol: "AGR", driftPerTick: 0.003, reactionDelayTicks: 2, durationTicks: 3 }];
    const result = validate(plan, 40);
    assert.ok(result.ok);
    assert.equal(result.plan.beats[0].headline, "Rowing club wins the race");
    assert.equal(result.plan.beats[0].effects, undefined);
    assert.equal(cleanText("# Title\n\n- item   one", 100), "Title - item one");
  });

  it("rejects a plan without the minimum mix", () => {
    const plan = clone(orchard.newsroom!);
    plan.beats = plan.beats.filter((b) => b.kind !== "MARKET");
    const result = validate(plan, 40);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.some((e) => e.includes("MARKET")));
  });

  it("falls back for a scenario with an invalid or missing plan", () => {
    const broken: ScenarioConfig = { ...orchard, id: "broken", newsroom: { beats: [{ id: "x" }] } as unknown as NewsroomPlan };
    const missing: ScenarioConfig = { ...energyShock, id: "missing", newsroom: undefined };
    for (const scenario of [broken, missing]) {
      const plan = resolveNewsroomPlan(scenario);
      assert.ok(plan.beats.length > 0, scenario.id);
      assert.ok(plan.beats.every((b) => !b.effects?.length), "fallback stories add no price effects");
    }
  });
});

describe("newsroom effects", () => {
  for (const scenario of [energyShock, orchard]) {
    it(`${scenario.id}: moves start only at airTick + reactionDelayTicks and stay in bounds`, () => {
      const plan = resolveNewsroomPlan(scenario);
      const plain = generatePricePath(scenario);
      const withNews = generatePricePath(withNewsroom(scenario, plan));
      for (const symbol of ASSET_SYMBOLS) {
        const effects = plan.beats.flatMap((b) => (b.effects ?? []).map((e) => ({ ...e, start: b.airTick + e.reactionDelayTicks })));
        const starts = effects.filter((e) => e.symbol === symbol).map((e) => e.start);
        const firstDiff = withNews[symbol].findIndex((p, t) => p !== plain[symbol][t]);
        if (!starts.length) assert.equal(firstDiff, -1, `${symbol} has no story but moved`);
        else assert.ok(firstDiff >= Math.min(...starts), `${symbol} moved at tick ${firstDiff}, before ${Math.min(...starts)}`);
        const { min, max } = priceBounds(symbol);
        assert.ok(withNews[symbol].every((p) => p >= min && p <= max));
      }
    });
  }

  it("same seed, same plan, events and prices", () => {
    // A fresh validation, not the cached plan, must give the same beats, events and prices.
    const fresh = validate(energyShock.newsroom, energyShock.totalTicks);
    assert.ok(fresh.ok);
    assert.deepEqual(fresh.plan, resolveNewsroomPlan(energyShock));
    assert.deepEqual(compileNewsroomEvents(fresh.plan), compileNewsroomEvents(resolveNewsroomPlan(energyShock)));
    const a = withNewsroom(energyShock, resolveNewsroomPlan(energyShock));
    const b = withNewsroom(energyShock, fresh.plan);
    assert.deepEqual(generatePricePath(a, "seed-1"), generatePricePath(b, "seed-1"));
    assert.notDeepEqual(generatePricePath(a, "seed-1"), generatePricePath(a, "seed-2"));
    assert.deepEqual(buildFallbackNewsroomPlan(orchard), buildFallbackNewsroomPlan(orchard));
  });

  it("describes moves for the broadcast log", () => {
    const beats = resolveNewsroomPlan(energyShock).beats;
    const byId = (id: string) => beats.find((b) => b.id === id)!;
    assert.deepEqual(broadcastMoves(byId("nr-weather")), []);
    assert.equal(broadcastMoves(byId("nr-cloud-north"))[0].beforeAir, true);
    assert.equal(broadcastMoves(byId("nr-bank-dividend"))[0].reverts, true);
    assert.ok(broadcastMoves(byId("nr-battery-fault"))[0].pct < 0);
  });
});

describe("newsroom scripts", () => {
  const plan = resolveNewsroomPlan(energyShock);

  it("templates are deterministic, sign on first and flag cluster follow-ups", () => {
    for (const beat of plan.beats) assert.deepEqual(templateScript(plan, beat, "s"), templateScript(plan, beat, "s"));
    assert.match(templateScript(plan, plan.beats[0], "s")[0], /^Good evening, this is MMN/);
    const fault = plan.beats.find((b) => b.id === "nr-battery-fault")!;
    assert.match(templateScript(plan, fault, "s")[0], /update on that story/);
  });

  it("fits each story into its slot at the default tick speed, so stories never overlap", () => {
    for (const [i, beat] of plan.beats.entries()) {
      const slot = slotMs(plan, i, 2000, energyShock.totalTicks);
      const lines = fitToSlot(templateScript(plan, beat, "s"), slot);
      const last = lines[lines.length - 1];
      assert.ok(last.atMs + last.durationMs <= slot, `${beat.id} runs over its slot`);
      lines.slice(1).forEach((l, k) => assert.equal(l.atMs, lines[k].atMs + lines[k].durationMs));
    }
  });

  it("shortens scripts for fast ticks but always keeps the first line", () => {
    const lines = fitToSlot(["One two three four five.", "Six seven eight."], 500);
    assert.equal(lines.length, 1);
  });

  it("only accepts generated lines that stick to the beat's facts", () => {
    const beat: NewsroomBeat = { id: "b", airTick: 5, kind: "MARKET", category: "farm", headline: "Yields up 4%", facts: "Crops grew fast." };
    assert.deepEqual(acceptGeneratedScript(["Yields rose <i>4%</i>.", "Crops grew fast."], beat), ["Yields rose 4%.", "Crops grew fast."]);
    assert.equal(acceptGeneratedScript(["Shares will jump 30%."], beat), null);
    assert.equal(acceptGeneratedScript("Yields rose.", beat), null);
    assert.equal(acceptGeneratedScript([], beat), null);
    assert.equal(acceptGeneratedScript(["a", "b", "c", "d", "e"], beat), null);
  });

  it("falls back to templates when the generator fails, hangs or returns junk", async () => {
    const failing: ScriptGenerator = async () => {
      throw new Error("boom");
    };
    const hanging: ScriptGenerator = () => new Promise(() => {});
    const junk: ScriptGenerator = async () => ({ "nr-weather": "not an array", "nr-marathon": ["Fine words.", "More words."] });
    for (const generate of [failing, hanging, junk]) {
      const scripts = createNewsroomScripts({ generate, timeoutMs: 20 });
      scripts.prefetch(energyShock, plan);
      await sleep(40);
      const weather = plan.beats[0];
      assert.deepEqual(scripts.linesFor(energyShock, plan, weather, "s"), templateScript(plan, weather, "s"));
    }
    const partial = createNewsroomScripts({ generate: junk });
    partial.prefetch(energyShock, plan);
    await sleep(10);
    assert.deepEqual(partial.linesFor(energyShock, plan, plan.beats[1], "s"), ["Fine words.", "More words."]);
  });

  it("uses a beat's own script as is", () => {
    const scripted = { ...plan.beats[0], script: ["Ready-made line."] };
    assert.deepEqual(createNewsroomScripts().linesFor(energyShock, plan, scripted, "s"), ["Ready-made line."]);
  });
});

describe("newsroom in a round", () => {
  for (const scenario of [energyShock, orchard]) {
    it(`${scenario.id}: airs every beat in order to the room only, with no effect data`, async () => {
      const { room, sent, segments } = harness(scenario);
      assert.equal(room.start("host"), null);
      const results = await untilFinished(room);
      const plan = resolveNewsroomPlan(scenario);
      const aired = segments();
      assert.deepEqual(aired.map((s) => s.airTick), plan.beats.map((b) => b.airTick));
      for (const s of sent.filter((x) => x.event === S2C.NEWSROOM_SEGMENT)) {
        assert.equal(s.channel, "room");
        assert.equal(s.target, room.code);
      }
      for (const segment of aired) {
        const json = JSON.stringify(segment);
        for (const secret of ["effects", "drift", "reactionDelay", "kind", "MARKET", "NOISE", "clusterId", "facts"]) {
          assert.ok(!json.includes(secret), `segment leaks ${secret}`);
        }
      }
      assert.equal(results.broadcast?.segments.length, plan.beats.length);
      assert.ok(results.broadcast!.lessons.length >= 1);
    });
  }

  it("late joiners and reconnects get only the story on air now", async () => {
    const { room, segments } = harness(orchard, {}, 15);
    room.start("host");
    const seen = new Set<string>();
    while (room.status !== "FINISHED") {
      const current = room.publicState().newsroom.current;
      const latest = segments().at(-1);
      if (current) {
        assert.equal(current.segmentId, latest?.segmentId, "only the latest segment is ever current");
        seen.add(current.segmentId);
      }
      await sleep(3);
    }
    assert.ok(seen.size >= 2);
    assert.equal(room.publicState().newsroom.current, null, "nothing is on air after the bell");
  });

  it("host toggle off: nothing scheduled, nothing sent, market as without the newsroom", async () => {
    const { room, segments } = harness(energyShock);
    assert.equal(room.setNewsroom("someone", false)?.code, "NOT_IN_ROOM");
    room.addPlayer("guest", "Guest");
    assert.equal(room.setNewsroom("guest", false)?.code, "NOT_HOST");
    assert.equal(room.setNewsroom("host", false), null);
    assert.equal(room.publicState().newsroom.enabled, false);
    room.start("host");
    assert.equal(room.setNewsroom("host", true)?.code, "ROUND_IN_PROGRESS");
    const results = await untilFinished(room);
    assert.equal(segments().length, 0);
    assert.equal(results.broadcast, undefined);
    const plain = generatePricePath(energyShock);
    const history = room.publicState().market!.history;
    for (const symbol of ASSET_SYMBOLS) {
      const expected = plain[symbol].map((p) => quotePrice(symbol, p, 0));
      assert.deepEqual(history[symbol].slice(0, expected.length), expected);
    }
  });

  it("a hanging script generator never delays the round", async () => {
    const scripts = createNewsroomScripts({ generate: () => new Promise(() => {}) });
    const { room, segments } = harness(energyShock, { scripts });
    const startedAt = Date.now();
    room.start("host");
    await untilFinished(room);
    assert.ok(Date.now() - startedAt < 3000);
    const plan = resolveNewsroomPlan(energyShock);
    assert.equal(segments()[0].lines[0].text, templateScript(plan, plan.beats[0], energyShock.seed)[0]);
  });

  it("uses a fresh seed every round only when random seeds are on", async () => {
    const closes = async (options: RoomOptions) => {
      const out: number[][] = [];
      for (let i = 0; i < 2; i++) {
        const { room } = harness(orchard, options);
        room.start("host");
        await untilFinished(room);
        out.push(room.publicState().market!.history.NVE);
      }
      return out;
    };
    const fixed = await closes({});
    assert.deepEqual(fixed[0], fixed[1]);
    const random = await closes({ randomSeeds: true });
    assert.notDeepEqual(random[0], random[1]);
  });
});
