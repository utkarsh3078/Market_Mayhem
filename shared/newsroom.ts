import { z } from "zod";
import type { AssetSymbol } from "./assets";

// Live Newsroom contract (docs/newsroom-plan-format.md).
//
// A scenario supplies its newsroom only through `newsroom: NewsroomPlan`. Plans are server-only hidden
// truth: kinds and effects never reach the browser. Players receive a NewsroomSegment when a story airs,
// and the BroadcastLog only once the round is over.

export const NEWSROOM_KINDS = ["GENERAL", "MARKET", "NOISE", "PRICED_IN", "MISLEADING"] as const;
export type NewsroomKind = (typeof NEWSROOM_KINDS)[number];

/** Topics the studio can illustrate. Any other category still airs, over a plain category card. */
export const NEWSROOM_CATEGORIES = [
  "weather",
  "sports",
  "culture",
  "world",
  "energy",
  "shipping",
  "farm",
  "factory",
  "tech",
  "bank",
  "market",
] as const;

export const EFFECT_SHAPES = ["STEP", "RAMP", "SPIKE_REVERT"] as const;
export type EffectShape = (typeof EFFECT_SHAPES)[number];

export const NEWSROOM_TONES = ["urgent", "calm", "playful"] as const;

export interface NewsroomEffect {
  symbol: AssetSymbol;
  /** Added to the asset's per-tick return while the effect runs, e.g. -0.004. */
  driftPerTick: number;
  /** Ticks after airTick before the move starts. Negative only for PRICED_IN (the move came first). */
  reactionDelayTicks: number;
  durationTicks: number;
  /** STEP: constant drift. RAMP: builds up to the drift. SPIKE_REVERT: moves, then gives it back. */
  shape?: EffectShape;
}

export interface NewsroomBeat {
  id: string;
  airTick: number;
  kind: NewsroomKind;
  category: string;
  headline: string;
  /** The only facts the anchor may state. */
  facts: string;
  /** Optional ready-made anchor lines; written from headline and facts when absent. */
  script?: string[];
  tone?: (typeof NEWSROOM_TONES)[number];
  /** Beats sharing a cluster air back to back. */
  clusterId?: string;
  effects?: NewsroomEffect[];
}

export interface NewsroomPlan {
  beats: NewsroomBeat[];
}

// Raw input schemas: deliberately loose on values (symbols, ranges, text) so the validator can repair
// a beat instead of rejecting the whole plan. See server/newsroom/validate.ts.

export const newsroomEffectSchema = z.object({
  symbol: z.string(),
  driftPerTick: z.number().finite(),
  reactionDelayTicks: z.number().int(),
  durationTicks: z.number().int(),
  shape: z.enum(EFFECT_SHAPES).optional(),
});

export const newsroomBeatSchema = z.object({
  id: z.string().trim().min(1).max(64),
  airTick: z.number().int(),
  kind: z.enum(NEWSROOM_KINDS),
  category: z.string().max(40),
  headline: z.string().max(400),
  facts: z.string().max(1200),
  script: z.array(z.string().max(600)).max(8).optional(),
  tone: z.enum(NEWSROOM_TONES).optional(),
  clusterId: z.string().max(64).optional(),
  effects: z.array(newsroomEffectSchema).max(6).optional(),
});

export const newsroomPlanSchema = z.object({ beats: z.array(z.unknown()) });

// ---------- public payloads ----------

export interface NewsroomLine {
  text: string;
  /** Offset from the segment start, ms. */
  atMs: number;
  durationMs: number;
}

/** One aired story, as sent to the room. It carries no kind and no effect data. */
export interface NewsroomSegment {
  roundId: string;
  segmentId: string;
  headline: string;
  category: string;
  airTick: number;
  lines: NewsroomLine[];
  /** Server epoch ms when the anchor started; captions are timed from here. */
  startedAt: number;
  durationMs: number;
}

export interface NewsroomState {
  enabled: boolean;
  /** The story on air right now, if any. Earlier stories are never resent. */
  current: NewsroomSegment | null;
}

export interface BroadcastMove {
  symbol: AssetSymbol;
  /** Approximate size of the move the story caused, in percent. */
  pct: number;
  /** The move was an overreaction that gave itself back. */
  reverts: boolean;
  /** The move started before the story aired. */
  beforeAir: boolean;
}

export interface BroadcastLogEntry {
  segmentId: string;
  airTick: number;
  headline: string;
  kind: NewsroomKind;
  category: string;
  moves: BroadcastMove[];
}

/** Results-screen debrief of everything that aired. */
export interface BroadcastLog {
  segments: BroadcastLogEntry[];
  lessons: string[];
}
