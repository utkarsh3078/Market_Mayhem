import type { AssetSymbol } from "../../shared/assets";
import type { NewsroomPlan } from "../../shared/newsroom";
import type { ClueConfidence } from "../../shared/types";

export type AssetWeights = Partial<Record<AssetSymbol, number>>;

/** A market force active for ticks in [startTick, endTick). perTick is the drift added to each tick's return. */
export interface ScenarioEvent {
  id: string;
  startTick: number;
  endTick: number;
  perTick: AssetWeights;
}

export interface ScenarioNews {
  id: string;
  tick: number;
  headline: string;
  body: string;
  category: string;
}

export interface ScenarioClue {
  id: string;
  title: string;
  content: string;
  confidence: ClueConfidence;
  hint: string;
}

export interface ScenarioConfig {
  id: string;
  version: number;
  name: string;
  teaser: string;
  seed: string;
  totalTicks: number;
  /** Max absolute per-tick random noise (e.g. 0.004 = ±0.4%). */
  noise: number;
  /** Per-tick shared market noise applied to every asset. */
  marketNoise: number;
  events: ScenarioEvent[];
  news: ScenarioNews[];
  /** Assigned to players in this order (cycled when there are more players than clues). */
  clues: ScenarioClue[];
  resolution: {
    headline: string;
    summary: string;
    /** One-off return applied to each asset when the hidden event resolves. */
    shock: AssetWeights;
    explanations: Record<AssetSymbol, string>;
    lessons: string[];
  };
  /**
   * Live Newsroom stories (docs/newsroom-plan-format.md). Optional: without one, or if it fails
   * validation, rounds air a plan built from `news` instead (server/newsroom/plan.ts).
   */
  newsroom?: NewsroomPlan;
}

/**
 * What each clue and headline *suggests*, used only by the balance simulator (server/balance).
 * Kept outside ScenarioConfig on purpose: clue and news objects are copied to players as-is,
 * so anything inside them would be sent to the browser.
 */
export interface BalanceHints {
  /** Clue id → the trade a player acting only on that clue makes. AVOID = stays in cash (no shorting). */
  clues: Record<string, { symbol: AssetSymbol; action: "BUY" | "AVOID" }>;
  /** News id → the asset the headline praises (what a headline chaser buys). Omit neutral/negative headlines. */
  praises: Record<string, AssetSymbol>;
}
