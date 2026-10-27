import { ASSET_SYMBOLS, type AssetSymbol } from "../../shared/assets";
import { MAX_ORDER_QUANTITY, STARTING_CASH, tradeFee } from "../../shared/rules";
import type { ClueConfidence } from "../../shared/types";
import { applyShock, generatePricePath, quotePrice, type PricePath } from "../engine/market";
import { calculatePortfolioValue, executeTrade, type Account } from "../engine/portfolio";
import type { BalanceHints, ScenarioConfig } from "../scenarios/types";

// Automated version of the execution plan's F5 balance play-test: play each scenario with the
// plan's three fixed strategies on the real deterministic price path and check the balance targets.
// Player price impact is ignored (one player's orders barely move the path).

export interface ClueRun {
  clueId: string;
  confidence: ClueConfidence;
  symbol: AssetSymbol;
  action: "BUY" | "AVOID";
  pnl: number;
}

export interface BalanceRun {
  seed: string;
  holder: number;
  chaser: number;
  clues: ClueRun[];
}

export interface BalanceCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Ticks a person needs to read a headline and confirm an order (2 s per tick by default). */
export const REACTION_TICKS = 2;

const price = (path: PricePath, symbol: AssetSymbol, tick: number) => quotePrice(symbol, path[symbol][tick], 0);

function finalPrices(scenario: ScenarioConfig, path: PricePath): Record<AssetSymbol, number> {
  const last = scenario.totalTicks;
  return Object.fromEntries(
    ASSET_SYMBOLS.map((s) => [s, applyShock(s, price(path, s, last), scenario.resolution.shock[s] ?? 0)]),
  ) as Record<AssetSymbol, number>;
}

/** Spend (almost) all cash on one asset at the given tick. */
function buyAll(account: Account, path: PricePath, symbol: AssetSymbol, tick: number): Account {
  const p = price(path, symbol, tick);
  let quantity = Math.min(MAX_ORDER_QUANTITY, Math.floor(account.cash / p));
  while (quantity > 0 && quantity * p + tradeFee(quantity * p) > account.cash) quantity -= 1;
  if (quantity <= 0) return account;
  const result = executeTrade(account, "BUY", symbol, quantity, p);
  return result.ok ? result.account : account;
}

function sellAll(account: Account, path: PricePath, tick: number): Account {
  let next = account;
  for (const [symbol, position] of Object.entries(account.positions)) {
    if (!position?.quantity) continue;
    const s = symbol as AssetSymbol;
    const result = executeTrade(next, "SELL", s, position.quantity, price(path, s, tick));
    if (result.ok) next = result.account;
  }
  return next;
}

const pnlOf = (account: Account, prices: Record<AssetSymbol, number>) =>
  calculatePortfolioValue(account, prices) - STARTING_CASH;

export function simulate(scenario: ScenarioConfig, hints: BalanceHints, seed = scenario.seed): BalanceRun {
  const path = generatePricePath(scenario, seed);
  const final = finalPrices(scenario, path);
  const fresh = (): Account => ({ cash: STARTING_CASH, positions: {} });

  // Headline chaser: whenever a headline praises an asset, rotate everything into it,
  // REACTION_TICKS after it is published.
  let chaser = fresh();
  for (const item of [...scenario.news].sort((a, b) => a.tick - b.tick)) {
    const praised = hints.praises[item.id];
    if (!praised) continue;
    const tick = Math.min(item.tick + REACTION_TICKS, scenario.totalTicks);
    chaser = buyAll(sellAll(chaser, path, tick), path, praised, tick);
  }

  // Clue follower: acts once, at the first trading tick, on their own clue only.
  const clues: ClueRun[] = scenario.clues.map((clue) => {
    const hint = hints.clues[clue.id];
    const account = hint.action === "BUY" ? buyAll(fresh(), path, hint.symbol, 1) : fresh();
    return { clueId: clue.id, confidence: clue.confidence, ...hint, pnl: pnlOf(account, final) };
  });

  return { seed, holder: 0, chaser: pnlOf(chaser, final), clues };
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** The execution plan's F5 targets, made precise (no short selling, so AVOID clues equal holding). */
export function checkBalance(run: BalanceRun): BalanceCheck[] {
  const cluePnls = run.clues.map((c) => c.pnl);
  const best = Math.max(...cluePnls);
  const high = run.clues.filter((c) => c.confidence === "HIGH").map((c) => c.pnl);
  const low = run.clues.filter((c) => c.confidence === "LOW").map((c) => c.pnl);
  const cr = (cents: number) => `${cents >= 0 ? "+" : ""}${(cents / 100).toFixed(0)}`;
  return [
    {
      name: "clue followers beat the holder on average",
      ok: mean(cluePnls) > 0,
      detail: `mean clue P&L ${cr(mean(cluePnls))}`,
    },
    {
      name: "following a HIGH-confidence clue pays",
      ok: high.length > 0 && high.every((p) => p > 0),
      detail: `HIGH clue P&L ${high.map(cr).join(", ")}`,
    },
    {
      name: "the headline chaser is not the best strategy",
      ok: run.chaser < best,
      detail: `chaser ${cr(run.chaser)} vs best clue ${cr(best)}`,
    },
    {
      name: "the holder never wins outright",
      ok: Math.max(run.chaser, best) > run.holder,
      detail: `best player ${cr(Math.max(run.chaser, best))}`,
    },
    {
      name: "the LOW-confidence rumor never beats the HIGH clue",
      ok: low.every((l) => high.every((h) => l < h)),
      detail: `LOW ${low.map(cr).join(", ")} vs HIGH ${high.map(cr).join(", ")}`,
    },
  ];
}

/** Alternative seeds, to check that balance isn't luck of the one demo seed. */
export const altSeeds = (scenario: ScenarioConfig, count = 6) =>
  Array.from({ length: count }, (_, i) => `${scenario.seed}~alt${i + 1}`);
