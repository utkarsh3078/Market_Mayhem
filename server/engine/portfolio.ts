import type { AssetSymbol } from "../../shared/assets";
import { tradeFee } from "../../shared/rules";
import type { ErrorCode, Holding, LeaderboardEntry, TradeSide } from "../../shared/types";

export interface Position {
  quantity: number;
  averageCost: number; // cents per share
}

export interface Account {
  cash: number; // cents
  positions: Partial<Record<AssetSymbol, Position>>;
}

export type TradeOutcome =
  | { ok: true; account: Account; notional: number; fee: number; total: number }
  | { ok: false; code: ErrorCode };

/** Pure trade execution against an account. Never mutates its input. */
export function executeTrade(
  account: Account,
  side: TradeSide,
  symbol: AssetSymbol,
  quantity: number,
  price: number,
): TradeOutcome {
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, code: "INVALID_QUANTITY" };
  if (!Number.isInteger(price) || price <= 0) throw new Error(`Invalid execution price ${price}`);

  const notional = price * quantity;
  const fee = tradeFee(notional);
  const current = account.positions[symbol] ?? { quantity: 0, averageCost: 0 };
  const positions = { ...account.positions };

  if (side === "BUY") {
    const total = notional + fee;
    if (total > account.cash) return { ok: false, code: "INSUFFICIENT_CASH" };
    const quantityAfter = current.quantity + quantity;
    positions[symbol] = {
      quantity: quantityAfter,
      averageCost: Math.round((current.quantity * current.averageCost + notional) / quantityAfter),
    };
    return { ok: true, account: { cash: account.cash - total, positions }, notional, fee, total };
  }

  if (quantity > current.quantity) return { ok: false, code: "INSUFFICIENT_HOLDINGS" };
  const total = notional - fee;
  const quantityAfter = current.quantity - quantity;
  if (quantityAfter === 0) delete positions[symbol];
  else positions[symbol] = { quantity: quantityAfter, averageCost: current.averageCost };
  return { ok: true, account: { cash: account.cash + total, positions }, notional, fee, total };
}

export function calculatePortfolioValue(
  account: Account,
  prices: Partial<Record<AssetSymbol, number>>,
): number {
  let value = account.cash;
  for (const [symbol, position] of Object.entries(account.positions) as [AssetSymbol, Position][]) {
    value += position.quantity * (prices[symbol] ?? 0);
  }
  return value;
}

export function toHoldings(account: Account): Holding[] {
  return (Object.entries(account.positions) as [AssetSymbol, Position][])
    .filter(([, p]) => p.quantity > 0)
    .map(([symbol, p]) => ({ symbol, quantity: p.quantity, averageCost: p.averageCost }));
}

export interface RankInput {
  playerId: string;
  displayName: string;
  portfolioValue: number;
  /** Tie-breaker: earlier joiners are listed first among equal values. */
  joinOrder: number;
}

/** Sort by portfolio value (desc). Equal values share a rank; order among ties is by join order. */
export function rankPlayers(inputs: RankInput[], startingCash: number): LeaderboardEntry[] {
  const sorted = [...inputs].sort(
    (a, b) => b.portfolioValue - a.portfolioValue || a.joinOrder - b.joinOrder,
  );
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.portfolioValue !== sorted[i - 1].portfolioValue) rank = i + 1;
    const pnl = p.portfolioValue - startingCash;
    return {
      playerId: p.playerId,
      displayName: p.displayName,
      portfolioValue: p.portfolioValue,
      pnl,
      returnPct: Math.round((pnl / startingCash) * 10_000) / 100,
      rank,
    };
  });
}
