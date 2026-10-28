import type { ScenarioListing } from "../../shared/types";
import type { ScenarioConfig } from "../scenarios/types";
import type { TextModel } from "./model";
import { generateScenario } from "./scenarioGenerator";
import { ScenarioPool, type AcquiredScenario } from "./scenarioPool";

export type { AcquiredScenario } from "./scenarioPool";

/** Id the lobby uses for "let Gemma write the scenario". It is never a real registry entry. */
export const AI_SCENARIO_ID = "ai";

export const AI_LISTING: ScenarioListing = {
  id: AI_SCENARIO_ID,
  name: "AI Scenario",
  teaser: "Gemma 4 writes a brand-new situation for every round. Nobody, not even the host, knows the answer in advance.",
  kind: "ai",
};

/** What a room needs to offer AI-written scenarios. Rooms never see models, keys or prompts. */
export interface AiScenarios {
  /** Gemma-written scenarios are available. */
  readonly enabled: boolean;
  acquire(theme?: string): Promise<AcquiredScenario>;
  /** Hand back a scenario that was acquired but never played. */
  release(scenario: ScenarioConfig): void;
  close?(): void;
}

/** Used when no Gemma backend is configured: the game runs exactly as it did without AI. */
export const noAiScenarios: AiScenarios = {
  enabled: false,
  acquire: () => Promise.reject(new Error("AI scenarios are not enabled")),
  release: () => {},
};

export interface AiScenariosOptions {
  /** Already guarded and quota-limited by the caller, so scenarios and summaries share one budget. */
  model: TextModel;
  /** Built-in scenarios used whenever Gemma cannot deliver. */
  fallbacks: ScenarioConfig[];
  /** Scenarios kept ready in the background. 0 writes them only on demand. */
  poolSize?: number;
  /** Start filling the pool as soon as the server boots. */
  warmUp?: boolean;
  acquireWaitMs?: number;
  log?: (message: string) => void;
}

export function createAiScenarios(options: AiScenariosOptions): AiScenarios {
  const log = options.log ?? (() => {});
  const pool = new ScenarioPool({
    generate: (theme) => generateScenario(options.model, { theme, log }),
    fallbacks: options.fallbacks,
    targetSize: options.poolSize ?? 2,
    acquireWaitMs: options.acquireWaitMs,
    log,
  });
  if (options.warmUp ?? true) pool.warmUp();
  return {
    enabled: true,
    acquire: (theme) => pool.acquire(theme),
    release: (scenario) => pool.release(scenario),
    close: () => pool.stop(),
  };
}