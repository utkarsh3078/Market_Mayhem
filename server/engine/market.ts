import { ASSETS, type AssetSymbol } from "../../shared/assets";
import type { ScenarioConfig } from "../scenarios/types";
import { createRng, symmetric } from "./rng";

export const MAX_TICK_RETURN = 0.04;
export const MIN_PRICE_FACTOR = 0.2;
export const MAX_PRICE_FACTOR = 5;

/** Trade impact: notional (cents) that moves price by 100%. Larger = deeper market. */
export const LIQUIDITY = 100_000_000;
export const MAX_TRADE_IMPACT = 0.03;
export const IMPACT_DECAY = 0.8;

export type PricePath = Record<AssetSymbol, number[]>;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function priceBounds(symbol: AssetSymbol): { min: number; max: number } {
  const initial = ASSETS.find((a) => a.symbol === symbol)!.initialPrice;
  return { min: initial * MIN_PRICE_FACTOR, max: initial * MAX_PRICE_FACTOR };
}

export function eventImpact(scenario: ScenarioConfig, symbol: AssetSymbol, tick: number): number {
  let total = 0;
  for (const event of scenario.events) {
    if (tick >= event.startTick && tick < event.endTick) {
      total += event.perTick[symbol] ?? 0;
    }
  }
  return total;
}

/**
 * Deterministic underlying price path (float cents) for ticks 0..totalTicks.
 *   nextPrice = clamp(price × (1 + clamp(eventImpact + noise)))
 * Player trades add a separate, decaying impact on top of this path.
 */
export function generatePricePath(scenario: ScenarioConfig, seed = scenario.seed): PricePath {
  const rng = createRng(`${scenario.id}:${scenario.version}:${seed}`);
  const path = Object.fromEntries(ASSETS.map((a) => [a.symbol, [a.initialPrice]])) as PricePath;

  for (let tick = 1; tick <= scenario.totalTicks; tick++) {
    const market = symmetric(rng, scenario.marketNoise);
    for (const asset of ASSETS) {
      const series = path[asset.symbol];
      const noise = symmetric(rng, scenario.noise) + market;
      const r = clamp(eventImpact(scenario, asset.symbol, tick) + noise, -MAX_TICK_RETURN, MAX_TICK_RETURN);
      const { min, max } = priceBounds(asset.symbol);
      series.push(clamp(series[tick - 1] * (1 + r), min, max));
    }
  }
  return path;
}

/** Quoted price in integer cents = underlying path × (1 + player-driven impact). */
export function quotePrice(symbol: AssetSymbol, base: number, impact: number): number {
  const { min, max } = priceBounds(symbol);
  return Math.max(1, Math.round(clamp(base * (1 + impact), min, max)));
}

/** Impact of a trade with the given notional (cents). Positive for buys, negative for sells. */
export function tradeImpact(side: "BUY" | "SELL", notional: number): number {
  const magnitude = Math.min(MAX_TRADE_IMPACT, notional / LIQUIDITY);
  return side === "BUY" ? magnitude : -magnitude;
}

export function applyShock(symbol: AssetSymbol, price: number, shock: number): number {
  const { min, max } = priceBounds(symbol);
  return Math.max(1, Math.round(clamp(price * (1 + shock), min, max)));
}
