import type { BroadcastLogEntry, BroadcastMove, NewsroomBeat, NewsroomPlan } from "../../shared/newsroom";
import type { ScenarioConfig, ScenarioEvent } from "../scenarios/types";
import { NEWSROOM_RULES, validateNewsroomPlan } from "./validate";

// Newsroom plans for any scenario: the scenario's own `newsroom` when it validates, otherwise one
// built deterministically from the scenario's public news plus harmless general stories.

/** Fictional, market-neutral filler. Scenario-agnostic, so any scenario can use it. */
const GENERAL_LIBRARY: Pick<NewsroomBeat, "category" | "headline" | "facts">[] = [
  {
    category: "weather",
    headline: "Sunny spells expected along the coast this weekend",
    facts: "Forecasters expect clear skies and light winds through Sunday. Beach towns are preparing for big crowds.",
  },
  {
    category: "sports",
    headline: "Harbor City Hawks reach the regional cup final",
    facts: "The Hawks won their semi-final on penalties. Tickets for the final sold out within an hour.",
  },
  {
    category: "culture",
    headline: "Record crowds at the Riverside Film Festival",
    facts: "Organisers say the opening night sold out. The festival runs for another week.",
  },
  {
    category: "world",
    headline: "Astronomers say a bright comet is visible after sunset",
    facts: "The comet will be easiest to see from dark parks outside the city later this week.",
  },
  {
    category: "sports",
    headline: "City marathon will close central roads on Sunday",
    facts: "Thousands of runners have signed up. Buses will follow diversions until the afternoon.",
  },
  {
    category: "culture",
    headline: "The old town library opens a late-night reading room",
    facts: "The reading room will stay open until midnight on weekdays, starting next month.",
  },
  {
    category: "world",
    headline: "Twin cities sign a new student exchange agreement",
    facts: "The agreement lets secondary school students spend a term abroad, starting next year.",
  },
  {
    category: "culture",
    headline: "Street food festival crowns its best dumpling",
    facts: "A family stall from the harbor district took the top prize after a public vote.",
  },
];

const NEWS_CATEGORY: Record<string, string> = {
  energy: "energy",
  technology: "tech",
  tech: "tech",
  banking: "bank",
  finance: "bank",
  mobility: "factory",
  manufacturing: "factory",
  agriculture: "farm",
  shipping: "shipping",
  weather: "weather",
  market: "market",
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Deterministic plan from the scenario itself: each public headline airs as a MARKET story with no
 * extra effect (the scenario's own events already move the price), and general stories fill the
 * longest gaps until roughly 40% of the broadcast is general news.
 */
export function buildFallbackNewsroomPlan(scenario: ScenarioConfig): NewsroomPlan {
  const lastTick = scenario.totalTicks - NEWSROOM_RULES.endMarginTicks;
  const beats: NewsroomBeat[] = [];
  for (const item of [...scenario.news].sort((a, b) => a.tick - b.tick)) {
    const airTick = Math.min(Math.max(item.tick, 1), lastTick);
    if (beats.some((b) => Math.abs(b.airTick - airTick) < NEWSROOM_RULES.minGapTicks)) continue;
    beats.push({
      id: `news-${item.id}`,
      airTick,
      kind: "MARKET",
      category: NEWS_CATEGORY[item.category.toLowerCase()] ?? "market",
      headline: item.headline,
      facts: item.body,
    });
  }

  // Split the biggest gap each time; a gap needs room for a story on both sides of the new one.
  const minGap = 2 * NEWSROOM_RULES.minGapTicks + 2;
  const bounds = [0, ...beats.map((b) => b.airTick), lastTick + NEWSROOM_RULES.minGapTicks];
  const gaps = bounds.slice(1).map((end, i) => ({ start: bounds[i], end }));
  const wanted = Math.min(
    Math.max(NEWSROOM_RULES.minGeneral, Math.ceil((beats.length * 0.4) / 0.6)),
    NEWSROOM_RULES.maxBeats - beats.length,
  );
  const offset = hash(scenario.id);
  for (let i = 0; i < wanted; i++) {
    gaps.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
    const gap = gaps.shift();
    if (!gap || gap.end - gap.start < minGap) break;
    const airTick = Math.floor((gap.start + gap.end) / 2);
    const story = GENERAL_LIBRARY[(offset + i) % GENERAL_LIBRARY.length];
    beats.push({ id: `general-${i + 1}`, airTick, kind: "GENERAL", ...story });
    gaps.push({ start: gap.start, end: airTick }, { start: airTick, end: gap.end });
  }
  return { beats: beats.sort((a, b) => a.airTick - b.airTick) };
}

const resolved = new WeakMap<ScenarioConfig, NewsroomPlan>();

/**
 * The plan a round of this scenario airs. Every scenario goes through validateNewsroomPlan; an invalid
 * or missing plan is replaced by the fallback, so newsroom content can never stop a round starting.
 */
export function resolveNewsroomPlan(scenario: ScenarioConfig, log: (message: string) => void = () => {}): NewsroomPlan {
  const cached = resolved.get(scenario);
  if (cached) return cached;
  const opts = { totalTicks: scenario.totalTicks };
  let plan: NewsroomPlan | null = null;
  if (scenario.newsroom !== undefined) {
    const result = validateNewsroomPlan(scenario.newsroom, opts);
    for (const w of result.warnings) log(`newsroom ${scenario.id}: ${w}`);
    if (result.ok) plan = result.plan;
    else log(`newsroom ${scenario.id}: plan rejected (${result.errors.join("; ")}), using the fallback plan`);
  }
  if (!plan) {
    const fallback = validateNewsroomPlan(buildFallbackNewsroomPlan(scenario), opts);
    plan = fallback.ok ? fallback.plan : { beats: [] };
  }
  resolved.set(scenario, plan);
  return plan;
}

/** The plan's effects as ordinary scenario events, so the engine applies them like any other. */
export function compileNewsroomEvents(plan: NewsroomPlan): ScenarioEvent[] {
  const events: ScenarioEvent[] = [];
  for (const beat of plan.beats) {
    for (const [i, e] of (beat.effects ?? []).entries()) {
      const id = `newsroom:${beat.id}:${i}`;
      const start = beat.airTick + e.reactionDelayTicks;
      const d = e.durationTicks;
      const at = (tick: number, endTick: number, drift: number) =>
        events.push({ id: `${id}@${tick}`, startTick: tick, endTick, perTick: { [e.symbol]: drift } });
      if (e.shape === "RAMP") {
        for (let k = 0; k < d; k++) at(start + k, start + k + 1, (e.driftPerTick * (k + 1)) / d);
      } else if (e.shape === "SPIKE_REVERT") {
        const up = Math.ceil(d / 2);
        at(start, start + up, e.driftPerTick);
        if (d > up) at(start + up, start + d, (-e.driftPerTick * up) / (d - up));
      } else {
        at(start, start + d, e.driftPerTick);
      }
    }
  }
  return events;
}

/** The scenario the engine runs when the newsroom is on: same noise and seed, plus the stories' effects. */
export function withNewsroom(scenario: ScenarioConfig, plan: NewsroomPlan): ScenarioConfig {
  const extra = compileNewsroomEvents(plan);
  return extra.length ? { ...scenario, events: [...scenario.events, ...extra] } : scenario;
}

const roundPct = (fraction: number) => Math.round(fraction * 1000) / 10;

export function broadcastMoves(beat: NewsroomBeat): BroadcastMove[] {
  return (beat.effects ?? []).map((e) => {
    const d = e.durationTicks;
    const size =
      e.shape === "RAMP"
        ? (e.driftPerTick * (d + 1)) / 2
        : e.shape === "SPIKE_REVERT"
          ? e.driftPerTick * Math.ceil(d / 2)
          : e.driftPerTick * d;
    return {
      symbol: e.symbol,
      pct: roundPct(size),
      reverts: e.shape === "SPIKE_REVERT",
      beforeAir: e.reactionDelayTicks < 0,
    };
  });
}

export function toLogEntry(beat: NewsroomBeat, segmentId: string): BroadcastLogEntry {
  return {
    segmentId,
    airTick: beat.airTick,
    headline: beat.headline,
    kind: beat.kind,
    category: beat.category,
    moves: broadcastMoves(beat),
  };
}

export const NEWSROOM_LESSONS = [
  "Market stories on the newsroom moved prices a few ticks after they aired. Watching gave you a head start, but only if you acted in time.",
  "Not every dramatic story mattered. Noise moved nothing, a priced-in story had already moved, and an overreaction gave its gains back.",
];
