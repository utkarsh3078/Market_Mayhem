import { ASSET_SYMBOLS, isAssetSymbol } from "../../shared/assets";
import { generatePricePath, priceBounds } from "../engine/market";
import type { ScenarioConfig } from "./types";

// The scenario contract (docs/scenario-authoring.md). Every registered scenario must pass it;
// server/test/scenarios.test.ts enforces it so a broken scenario fails `pnpm test`.

export const CONTRACT = {
  totalTicks: 90,
  events: { min: 6, max: 8, maxPerTick: 0.007 },
  news: { min: 8, max: 10, firstByTick: 6 },
  clues: 5,
  maxShock: 0.1,
  lessons: { min: 3, max: 4 },
} as const;

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Returns a list of human-readable contract violations (empty = valid). */
export function scenarioContractErrors(s: ScenarioConfig): string[] {
  const errors: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };
  const blank = (v: string) => !v || !v.trim();

  check(KEBAB.test(s.id), `id "${s.id}" must be kebab-case`);
  check(Number.isInteger(s.version) && s.version >= 1, "version must be an integer >= 1");
  check(!blank(s.seed), "seed must be non-empty");
  check(!blank(s.name) && !blank(s.teaser), "name and teaser must be non-empty");
  check(s.totalTicks === CONTRACT.totalTicks, `totalTicks must be ${CONTRACT.totalTicks}`);

  const { events } = CONTRACT;
  check(
    s.events.length >= events.min && s.events.length <= events.max,
    `needs ${events.min}-${events.max} events (has ${s.events.length})`,
  );
  for (const e of s.events) {
    check(
      e.startTick >= 0 && e.startTick < e.endTick && e.endTick <= s.totalTicks,
      `event "${e.id}" needs 0 <= startTick < endTick <= ${s.totalTicks}`,
    );
    for (const [symbol, value] of Object.entries(e.perTick)) {
      check(isAssetSymbol(symbol), `event "${e.id}" uses unknown symbol ${symbol}`);
      check(Math.abs(value ?? 0) <= events.maxPerTick, `event "${e.id}" ${symbol} |perTick| > ${events.maxPerTick}`);
    }
  }

  const { news } = CONTRACT;
  check(s.news.length >= news.min && s.news.length <= news.max, `needs ${news.min}-${news.max} news items (has ${s.news.length})`);
  check(new Set(s.news.map((n) => n.id)).size === s.news.length, "news ids must be unique");
  for (const n of s.news) {
    check(n.tick >= 1 && n.tick <= s.totalTicks - 2, `news "${n.id}" tick must be 1-${s.totalTicks - 2}`);
    check(![n.headline, n.body, n.category].some(blank), `news "${n.id}" has an empty field`);
  }
  check(s.news.some((n) => n.tick <= news.firstByTick), `at least one news item by tick ${news.firstByTick}`);

  check(s.clues.length === CONTRACT.clues, `needs exactly ${CONTRACT.clues} clues (has ${s.clues.length})`);
  check(new Set(s.clues.map((c) => c.id)).size === s.clues.length, "clue ids must be unique");
  check(s.clues.some((c) => c.confidence === "HIGH"), "at least one HIGH-confidence clue");
  check(s.clues.some((c) => c.confidence === "LOW"), "at least one LOW-confidence clue");
  for (const c of s.clues) {
    check(![c.id, c.title, c.content, c.hint].some(blank), `clue "${c.id}" has an empty field`);
  }

  const { resolution } = s;
  check(!blank(resolution.headline) && !blank(resolution.summary), "resolution needs a headline and summary");
  for (const [symbol, value] of Object.entries(resolution.shock)) {
    check(isAssetSymbol(symbol), `resolution.shock uses unknown symbol ${symbol}`);
    check(Math.abs(value ?? 0) <= CONTRACT.maxShock, `resolution.shock ${symbol} |shock| > ${CONTRACT.maxShock}`);
  }
  for (const symbol of ASSET_SYMBOLS) {
    check(!blank(resolution.explanations[symbol] ?? ""), `resolution.explanations missing ${symbol}`);
  }
  const { lessons } = CONTRACT;
  check(
    resolution.lessons.length >= lessons.min && resolution.lessons.length <= lessons.max,
    `needs ${lessons.min}-${lessons.max} lessons (has ${resolution.lessons.length})`,
  );

  // Only simulate the price path once the structure is sound.
  if (errors.length === 0) {
    const a = generatePricePath(s);
    const b = generatePricePath(s);
    for (const symbol of ASSET_SYMBOLS) {
      const { min, max } = priceBounds(symbol);
      check(
        a[symbol].every((p) => p >= min && p <= max),
        `price path for ${symbol} leaves priceBounds`,
      );
      check(JSON.stringify(a[symbol]) === JSON.stringify(b[symbol]), `price path for ${symbol} is not deterministic`);
    }
  }
  return errors;
}
