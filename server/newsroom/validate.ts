import { isAssetSymbol } from "../../shared/assets";
import {
  newsroomBeatSchema,
  newsroomPlanSchema,
  type NewsroomBeat,
  type NewsroomEffect,
  type NewsroomKind,
  type NewsroomPlan,
} from "../../shared/newsroom";

// Strict gate for every newsroom plan, hand-written or AI-generated (docs/newsroom-plan-format.md).
// Safe fixes (clamping a value, trimming text, dropping one bad beat) are applied and reported as
// warnings; anything else rejects the plan, and the caller falls back to a plan it builds itself.

export const NEWSROOM_RULES = {
  maxBeats: 14,
  /** Minimum ticks between two beats, so stories never talk over each other. */
  minGapTicks: 2,
  /** The last beat airs at least this many ticks before the closing bell. */
  endMarginTicks: 3,
  maxDriftPerTick: 0.007,
  delay: { min: -8, max: 10 },
  /** Market moves start at least this long after airing (PRICED_IN may start before). */
  minReactionTicks: 1,
  duration: { min: 2, max: 20 },
  /** |drift| × duration, per asset, for one beat and for the whole plan. */
  maxMovePerBeat: 0.06,
  maxMovePerAsset: 0.12,
  text: { headline: 90, facts: 320, category: 24, line: 220, lines: 4 },
  minGeneral: 2,
  minMarket: 1,
  /** Market beats this close together count as a back-to-back cluster. */
  clusterWindowTicks: 6,
} as const;

const R = NEWSROOM_RULES;

export type NewsroomValidation =
  | { ok: true; plan: NewsroomPlan; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/** Plain spoken text only: no HTML, markdown, links or emoji; collapsed whitespace; cut at a word. */
export function cleanText(raw: string, max: number): string {
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>~|\\[\]{}]/g, "")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:%])/g, "$1")
    .replace(/^[-•]\s+/, "")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:-]+$/, "");
}

const isFiller = (kind: NewsroomKind) => kind === "GENERAL" || kind === "NOISE";
const isMarket = (kind: NewsroomKind) => kind === "MARKET" || kind === "PRICED_IN" || kind === "MISLEADING";
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function cleanEffects(beat: NewsroomBeat, raw: unknown[], totalTicks: number, warn: (m: string) => void): NewsroomEffect[] {
  const effects: NewsroomEffect[] = [];
  for (const [i, value] of raw.entries()) {
    const e = value as NewsroomEffect & { symbol: string };
    const label = `beat "${beat.id}" effect ${i}`;
    if (!isAssetSymbol(e.symbol)) {
      warn(`${label} dropped: unknown symbol ${e.symbol}`);
      continue;
    }
    if (e.driftPerTick === 0) {
      warn(`${label} dropped: zero drift`);
      continue;
    }
    let drift = clamp(e.driftPerTick, -R.maxDriftPerTick, R.maxDriftPerTick);
    if (drift !== e.driftPerTick) warn(`${label} drift clamped to ${drift}`);
    const minDelay = beat.kind === "PRICED_IN" ? R.delay.min : R.minReactionTicks;
    let delay = clamp(e.reactionDelayTicks, minDelay, R.delay.max);
    if (delay !== e.reactionDelayTicks) warn(`${label} reaction delay clamped to ${delay}`);
    let duration = clamp(e.durationTicks, R.duration.min, R.duration.max);
    if (duration !== e.durationTicks) warn(`${label} duration clamped to ${duration}`);

    // Keep the whole move inside the round.
    const start = Math.max(1, beat.airTick + delay);
    const end = Math.min(totalTicks, start + duration);
    if (end - start < R.duration.min) {
      warn(`${label} dropped: it would run past the closing bell`);
      continue;
    }
    if (start !== beat.airTick + delay || end - start !== duration) warn(`${label} trimmed to fit the round`);
    delay = start - beat.airTick;
    duration = end - start;

    if (Math.abs(drift) * duration > R.maxMovePerBeat) {
      drift = Math.sign(drift) * (R.maxMovePerBeat / duration);
      warn(`${label} scaled down to a ${R.maxMovePerBeat * 100}% move`);
    }
    let shape = e.shape ?? "STEP";
    if (beat.kind === "MISLEADING" && shape !== "SPIKE_REVERT") {
      if (e.shape) warn(`${label} shape set to SPIKE_REVERT (misleading stories revert)`);
      shape = "SPIKE_REVERT";
    }
    effects.push({ symbol: e.symbol, driftPerTick: drift, reactionDelayTicks: delay, durationTicks: duration, shape });
  }
  return effects;
}

export function validateNewsroomPlan(input: unknown, { totalTicks }: { totalTicks: number }): NewsroomValidation {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const top = newsroomPlanSchema.safeParse(input);
  if (!top.success) return { ok: false, errors: ["plan must be an object with a beats array"], warnings };

  const lastTick = totalTicks - R.endMarginTicks;
  const ids = new Set<string>();
  const parsed: { beat: NewsroomBeat; rawEffects: unknown[] }[] = [];
  for (const [i, raw] of top.data.beats.entries()) {
    const result = newsroomBeatSchema.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      warn(`beat ${i} dropped: ${issue?.path.join(".") || "beat"} ${issue?.message ?? "is invalid"}`);
      continue;
    }
    const b = result.data;
    if (ids.has(b.id)) {
      warn(`beat ${i} dropped: duplicate id "${b.id}"`);
      continue;
    }
    if (b.airTick < 1 || b.airTick > lastTick) {
      warn(`beat "${b.id}" dropped: airTick ${b.airTick} is outside 1-${lastTick}`);
      continue;
    }
    const headline = cleanText(b.headline, R.text.headline);
    const facts = cleanText(b.facts, R.text.facts);
    if (!headline || !facts) {
      warn(`beat "${b.id}" dropped: empty headline or facts`);
      continue;
    }
    if (headline !== b.headline.trim() || facts !== b.facts.trim()) warn(`beat "${b.id}" text cleaned`);
    const script = b.script?.map((line) => cleanText(line, R.text.line)).filter(Boolean).slice(0, R.text.lines);
    ids.add(b.id);
    parsed.push({
      beat: {
        id: b.id,
        airTick: b.airTick,
        kind: b.kind,
        category: cleanText(b.category, R.text.category).toLowerCase() || "market",
        headline,
        facts,
        ...(script?.length ? { script } : {}),
        ...(b.tone ? { tone: b.tone } : {}),
        ...(b.clusterId ? { clusterId: b.clusterId } : {}),
      },
      rawEffects: b.effects ?? [],
    });
  }

  // Order and spacing. Filler gives way to market stories; a market story too close to another is pushed back.
  parsed.sort((a, b) => a.beat.airTick - b.beat.airTick);
  const spaced: typeof parsed = [];
  for (const item of parsed) {
    const { beat } = item;
    let prev = spaced.at(-1);
    while (prev && beat.airTick - prev.beat.airTick < R.minGapTicks && isFiller(prev.beat.kind) && !isFiller(beat.kind)) {
      warn(`beat "${prev.beat.id}" dropped: overlaps "${beat.id}"`);
      spaced.pop();
      prev = spaced.at(-1);
    }
    if (prev && beat.airTick - prev.beat.airTick < R.minGapTicks) {
      const shifted = prev.beat.airTick + R.minGapTicks;
      if (isFiller(beat.kind) || shifted > lastTick) {
        warn(`beat "${beat.id}" dropped: overlaps "${prev.beat.id}"`);
        continue;
      }
      warn(`beat "${beat.id}" moved to tick ${shifted} so it doesn't overlap "${prev.beat.id}"`);
      beat.airTick = shifted;
    }
    spaced.push(item);
  }

  const beats: NewsroomBeat[] = [];
  for (const { beat, rawEffects } of spaced) {
    let effects = cleanEffects(beat, rawEffects, totalTicks, warn);
    if (isFiller(beat.kind) && effects.length) {
      warn(`beat "${beat.id}" effects removed: ${beat.kind} stories don't move prices`);
      effects = [];
    }
    if ((beat.kind === "PRICED_IN" || beat.kind === "MISLEADING") && !effects.length) {
      warn(`beat "${beat.id}" has no effects, so it airs as NOISE`);
      beat.kind = "NOISE";
    }
    beats.push(effects.length ? { ...beat, effects } : beat);
  }

  while (beats.length > R.maxBeats) {
    const fillerAt = beats.findLastIndex((b) => isFiller(b.kind));
    const [dropped] = beats.splice(fillerAt >= 0 ? fillerAt : beats.length - 1, 1);
    warn(`beat "${dropped.id}" dropped: more than ${R.maxBeats} beats`);
  }

  // One story can't decide the round, and neither can the plan as a whole.
  const totals = new Map<string, number>();
  for (const e of beats.flatMap((b) => b.effects ?? [])) {
    totals.set(e.symbol, (totals.get(e.symbol) ?? 0) + Math.abs(e.driftPerTick) * e.durationTicks);
  }
  for (const [symbol, total] of totals) {
    if (total <= R.maxMovePerAsset) continue;
    const factor = R.maxMovePerAsset / total;
    for (const e of beats.flatMap((b) => b.effects ?? []).filter((x) => x.symbol === symbol)) e.driftPerTick *= factor;
    warn(`${symbol} effects scaled down: ${(total * 100).toFixed(1)}% total exceeds ${R.maxMovePerAsset * 100}%`);
  }

  const errors: string[] = [];
  const inputCount = top.data.beats.length;
  if (!beats.length) errors.push("plan has no valid beats");
  else if (beats.length < inputCount / 2) errors.push(`only ${beats.length} of ${inputCount} beats are valid`);
  const general = beats.filter((b) => b.kind === "GENERAL").length;
  const market = beats.filter((b) => b.kind === "MARKET").length;
  if (general < R.minGeneral) errors.push(`needs at least ${R.minGeneral} GENERAL beats (has ${general})`);
  if (market < R.minMarket) errors.push(`needs at least ${R.minMarket} MARKET beat (has ${market})`);
  const marketTicks = beats.filter((b) => isMarket(b.kind)).map((b) => b.airTick);
  if (!marketTicks.some((t, i) => i > 0 && t - marketTicks[i - 1] <= R.clusterWindowTicks)) {
    warn("no back-to-back cluster of market stories");
  }
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, plan: { beats }, warnings };
}
