import type { AssetSymbol } from "../../shared/assets";
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
}
