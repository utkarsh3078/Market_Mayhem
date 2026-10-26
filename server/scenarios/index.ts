import type { ScenarioListing } from "../../shared/types";
import { energyShock } from "./energyShock";
import type { ScenarioConfig } from "./types";

// Server-only registry. To add a scenario: create server/scenarios/<name>.ts, import it
// here and add it to REGISTERED. `pnpm test` then checks it against the scenario contract.
const REGISTERED: ScenarioConfig[] = [energyShock];

export const DEFAULT_SCENARIO_ID = energyShock.id;

export type ScenarioRegistry = ReadonlyMap<string, ScenarioConfig>;

export function createRegistry(scenarios: ScenarioConfig[]): ScenarioRegistry {
  const registry = new Map<string, ScenarioConfig>();
  for (const scenario of scenarios) {
    if (registry.has(scenario.id)) throw new Error(`Duplicate scenario id: ${scenario.id}`);
    registry.set(scenario.id, scenario);
  }
  return registry;
}

export const SCENARIOS: ScenarioRegistry = createRegistry(REGISTERED);

/** The only scenario fields that may leave the server before a round starts. */
export function toListing(scenario: ScenarioConfig): ScenarioListing {
  return { id: scenario.id, name: scenario.name, teaser: scenario.teaser };
}

export function publicScenarios(registry: ScenarioRegistry): ScenarioListing[] {
  return [...registry.values()].map(toListing);
}

export const PUBLIC_SCENARIOS: ScenarioListing[] = publicScenarios(SCENARIOS);
