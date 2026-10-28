import type { NewsroomBeat, NewsroomLine, NewsroomPlan } from "../../shared/newsroom";
import type { ScenarioConfig } from "../scenarios/types";
import { cleanText, NEWSROOM_RULES } from "./validate";

// Anchor scripts. Templates are the default and the fallback; an optional generator (Gemini) only
// rewords a beat's own headline and facts. Generation happens ahead of the round and is cached, so
// a live tick never waits on it: a beat with no usable generated script airs its template.

/** Conservative speaking rate, so the voice usually finishes before the caption timer moves on. */
export const WORDS_PER_SECOND = 2.5;
const LINE_PAUSE_MS = 350;

export function speechMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round((words / WORDS_PER_SECOND) * 1000) + LINE_PAUSE_MS;
}

/** Keeps whole lines that fit the slot (always at least the first), timed back to back. */
export function fitToSlot(lines: string[], slotMs: number): NewsroomLine[] {
  const timed: NewsroomLine[] = [];
  let at = 0;
  for (const text of lines) {
    const durationMs = speechMs(text);
    if (timed.length && at + durationMs > slotMs) break;
    timed.push({ text, atMs: at, durationMs });
    at += durationMs;
  }
  return timed;
}

/** Time from a beat's air tick until the next beat (or the closing bell). */
export function slotMs(plan: NewsroomPlan, index: number, tickMs: number, totalTicks: number): number {
  const next = plan.beats[index + 1]?.airTick ?? totalTicks;
  return (next - plan.beats[index].airTick) * tickMs;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

// The same pool for every business story, so the transition never hints at a story's kind.
const BUSINESS_OPENERS = ["Turning to business.", "Market news now.", "This just in.", "In business news."];
const GENERAL_OPENERS = ["In other news.", "Away from the markets.", "Now for something lighter.", "Elsewhere today."];

/** Deterministic anchor lines for a beat. Openers vary with the round seed, so replays match. */
export function templateScript(plan: NewsroomPlan, beat: NewsroomBeat, seed: string): string[] {
  const index = plan.beats.indexOf(beat);
  const previous = index > 0 ? plan.beats[index - 1] : undefined;
  const pool = beat.kind === "GENERAL" ? GENERAL_OPENERS : BUSINESS_OPENERS;
  const opener =
    index === 0
      ? "Good evening, this is MMN, Market Mayhem News."
      : beat.clusterId && previous?.clusterId === beat.clusterId
        ? "Breaking now, an update on that story."
        : pool[hash(`${seed}:${beat.id}`) % pool.length];
  const facts = beat.facts.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2);
  return [`${opener} ${sentence(beat.headline)}`, ...facts.map(sentence)];
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Checks a generated script against its beat: 1-4 plain-text sentences that state no number the beat
 * doesn't. Returns the cleaned lines, or null to use the template instead.
 */
export function acceptGeneratedScript(lines: unknown, beat: NewsroomBeat): string[] | null {
  if (!Array.isArray(lines) || !lines.every((l) => typeof l === "string")) return null;
  const cleaned = lines.map((l: string) => cleanText(l, NEWSROOM_RULES.text.line)).filter(Boolean);
  if (!cleaned.length || cleaned.length > NEWSROOM_RULES.text.lines) return null;
  const known = new Set(`${beat.headline} ${beat.facts}`.match(NUMBER) ?? []);
  if (cleaned.some((l) => (l.match(NUMBER) ?? []).some((n) => !known.has(n)))) return null;
  return cleaned;
}

export interface ScriptRequest {
  id: string;
  category: string;
  tone?: string;
  headline: string;
  facts: string;
}

/** Writes anchor lines for several beats in one call, keyed by beat id. Injected so tests never call the network. */
export type ScriptGenerator = (beats: ScriptRequest[]) => Promise<Record<string, unknown>>;

export interface NewsroomScripts {
  /** Start generating scripts for a scenario's plan, if a generator is configured. Never throws or blocks. */
  prefetch(scenario: ScenarioConfig, plan: NewsroomPlan): void;
  /** Lines for one beat right now: the beat's own script, else a generated one, else the template. */
  linesFor(scenario: ScenarioConfig, plan: NewsroomPlan, beat: NewsroomBeat, seed: string): string[];
}

const GENERATE_TIMEOUT_MS = 25_000;
const RETRY_AFTER_MS = 5 * 60_000;

export function createNewsroomScripts(
  options: {
    generate?: ScriptGenerator;
    log?: (message: string) => void;
    timeoutMs?: number;
    retryAfterMs?: number;
    now?: () => number;
  } = {},
): NewsroomScripts {
  const { generate, log = () => {}, timeoutMs = GENERATE_TIMEOUT_MS, retryAfterMs = RETRY_AFTER_MS, now = Date.now } = options;
  // Plans are fixed per scenario version, so one generation serves every later round.
  const cache = new Map<string, Map<string, string[]>>();
  const pending = new Set<string>();
  const failedAt = new Map<string, number>();
  const keyOf = (s: ScenarioConfig) => `${s.id}@${s.version}`;

  return {
    prefetch(scenario, plan) {
      const key = keyOf(scenario);
      if (!generate || cache.has(key) || pending.has(key)) return;
      if (now() - (failedAt.get(key) ?? -Infinity) < retryAfterMs) return;
      const wanted = plan.beats.filter((b) => !b.script?.length);
      if (!wanted.length) return;
      pending.add(key);
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
      });
      const request = wanted.map((b) => ({ id: b.id, category: b.category, tone: b.tone, headline: b.headline, facts: b.facts }));
      Promise.race([generate(request), timeout])
        .then((result) => {
          const accepted = new Map<string, string[]>();
          for (const beat of wanted) {
            const lines = acceptGeneratedScript(result?.[beat.id], beat);
            if (lines) accepted.set(beat.id, lines);
          }
          cache.set(key, accepted);
          log(`newsroom scripts for ${key}: ${accepted.size}/${wanted.length} generated, the rest use templates`);
        })
        .catch((error: unknown) => {
          failedAt.set(key, now());
          log(`newsroom scripts for ${key} unavailable, using templates: ${error instanceof Error ? error.message : error}`);
        })
        .finally(() => {
          clearTimeout(timer);
          pending.delete(key);
        });
    },

    linesFor(scenario, plan, beat, seed) {
      if (beat.script?.length) return beat.script;
      return cache.get(keyOf(scenario))?.get(beat.id) ?? templateScript(plan, beat, seed);
    },
  };
}
