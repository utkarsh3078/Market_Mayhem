import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tradeFee } from "../../shared/rules";
import { generatePricePath, priceBounds } from "../engine/market";
import { calculatePortfolioValue, executeTrade, rankPlayers, type Account } from "../engine/portfolio";
import { energyShock } from "../scenarios/energyShock";

const fresh = (): Account => ({ cash: 10_000_000, positions: {} });

describe("executeTrade", () => {
  it("buy updates cash and shares, including fee", () => {
    const result = executeTrade(fresh(), "BUY", "NVE", 10, 12_000);
    assert.ok(result.ok);
    const fee = tradeFee(120_000);
    assert.equal(result.account.cash, 10_000_000 - 120_000 - fee);
    assert.deepEqual(result.account.positions.NVE, { quantity: 10, averageCost: 12_000 });
  });

  it("buy averages cost across fills", () => {
    const first = executeTrade(fresh(), "BUY", "NVE", 10, 10_000);
    assert.ok(first.ok);
    const second = executeTrade(first.account, "BUY", "NVE", 10, 12_000);
    assert.ok(second.ok);
    assert.equal(second.account.positions.NVE?.averageCost, 11_000);
  });

  it("rejects buys over available cash and leaves the account unchanged", () => {
    const account = fresh();
    const result = executeTrade(account, "BUY", "CLD", 1_000, 24_000);
    assert.deepEqual(result, { ok: false, code: "INSUFFICIENT_CASH" });
    assert.deepEqual(account, fresh());
  });

  it("rejects overselling", () => {
    const bought = executeTrade(fresh(), "BUY", "AGR", 5, 6_500);
    assert.ok(bought.ok);
    assert.deepEqual(executeTrade(bought.account, "SELL", "AGR", 6, 6_500), {
      ok: false,
      code: "INSUFFICIENT_HOLDINGS",
    });
    assert.deepEqual(executeTrade(fresh(), "SELL", "AGR", 1, 6_500), {
      ok: false,
      code: "INSUFFICIENT_HOLDINGS",
    });
  });

  it("sell credits proceeds minus fee and removes empty positions", () => {
    const bought = executeTrade(fresh(), "BUY", "MTB", 10, 9_000);
    assert.ok(bought.ok);
    const sold = executeTrade(bought.account, "SELL", "MTB", 10, 10_000);
    assert.ok(sold.ok);
    assert.equal(sold.account.cash, bought.account.cash + 100_000 - tradeFee(100_000));
    assert.equal(sold.account.positions.MTB, undefined);
  });

  it("rejects zero, negative and fractional quantities", () => {
    for (const q of [0, -5, 1.5]) {
      assert.deepEqual(executeTrade(fresh(), "BUY", "NVE", q, 12_000), { ok: false, code: "INVALID_QUANTITY" });
    }
  });
});

describe("calculatePortfolioValue", () => {
  it("returns cash + sum(quantity × price)", () => {
    const account: Account = {
      cash: 5_000_000,
      positions: { NVE: { quantity: 100, averageCost: 12_000 }, QTM: { quantity: 10, averageCost: 18_000 } },
    };
    assert.equal(calculatePortfolioValue(account, { NVE: 13_000, QTM: 17_500 }), 5_000_000 + 1_300_000 + 175_000);
  });
});

describe("rankPlayers", () => {
  it("sorts by value, shares rank on ties, and orders ties by join order", () => {
    const ranked = rankPlayers(
      [
        { playerId: "c", displayName: "C", portfolioValue: 9_000_000, joinOrder: 2 },
        { playerId: "b", displayName: "B", portfolioValue: 11_000_000, joinOrder: 1 },
        { playerId: "a", displayName: "A", portfolioValue: 11_000_000, joinOrder: 0 },
      ],
      10_000_000,
    );
    assert.deepEqual(
      ranked.map((r) => [r.playerId, r.rank, r.pnl, r.returnPct]),
      [
        ["a", 1, 1_000_000, 10],
        ["b", 1, 1_000_000, 10],
        ["c", 3, -1_000_000, -10],
      ],
    );
  });
});

describe("generatePricePath", () => {
  it("is reproducible for the same seed and differs for another seed", () => {
    const a = generatePricePath(energyShock, "seed-1");
    const b = generatePricePath(energyShock, "seed-1");
    const c = generatePricePath(energyShock, "seed-2");
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it("stays within configured bounds", () => {
    const path = generatePricePath(energyShock);
    for (const [symbol, series] of Object.entries(path)) {
      const { min, max } = priceBounds(symbol as keyof typeof path);
      assert.equal(series.length, energyShock.totalTicks + 1);
      for (const price of series) assert.ok(price >= min && price <= max);
    }
  });

  it("tells the scenario's story: energy spikes on the headline then reverses", () => {
    const nve = generatePricePath(energyShock).NVE;
    const peak = Math.max(...nve.slice(30, 46));
    assert.ok(peak > nve[5] * 1.1, "NVE should rally after the shipping headline");
    assert.ok(nve[70] < peak * 0.95, "NVE should give back gains once the route reopens");
  });
});
