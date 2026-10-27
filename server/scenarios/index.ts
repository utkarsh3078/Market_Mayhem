import type { ScenarioListing } from "../../shared/types";
import { batteryHype, batteryHypeHints } from "./batteryHype";
import { cloudBreach, cloudBreachHints } from "./cloudBreach";
import { energyShock, energyShockHints } from "./energyShock";
import { rateShock, rateShockHints } from "./rateShock";
import type { BalanceHints, ScenarioConfig } from "./types";

// Server-only registry. To add a scenario: create server/scenarios/<name>.ts (config + hints),
// import it here and add one line to REGISTERED. `pnpm test` then checks it against the scenario
// contract and the balance targets (`pnpm balance` prints the full table).
const REGISTERED: { config: ScenarioConfig; hints: BalanceHints }[] = [
  { config: energyShock, hints: energyShockHints },
  { config: rateShock, hints: rateShockHints },
  { config: cloudBreach, hints: cloudBreachHints },
  { config: batteryHype, hints: batteryHypeHints },
];

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

export const SCENARIOS: ScenarioRegistry = createRegistry(REGISTERED.map((r) => r.config));

/** Balance-simulator hints by scenario id. Never sent to clients. */
export const BALANCE_HINTS: ReadonlyMap<string, BalanceHints> = new Map(
  REGISTERED.map((r) => [r.config.id, r.hints]),
);

/** The only scenario fields that may leave the server before a round starts. */
export function toListing(scenario: ScenarioConfig): ScenarioListing {
  return { id: scenario.id, name: scenario.name, teaser: scenario.teaser };
}

export function publicScenarios(registry: ScenarioRegistry): ScenarioListing[] {
  return [...registry.values()].map(toListing);
}

export const PUBLIC_SCENARIOS: ScenarioListing[] = publicScenarios(SCENARIOS);
