import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAssetSymbol } from "../../shared/assets";
import { altSeeds, checkBalance, simulate } from "../balance/simulate";
import { resolveNewsroomPlan, withNewsroom } from "../newsroom/plan";
import { BALANCE_HINTS, SCENARIOS } from "../scenarios";

// The execution plan's F5 balance targets, automated. `pnpm balance` prints the full table.

describe("scenario balance", () => {
  for (const scenario of SCENARIOS.values()) {
    describe(scenario.id, () => {
      const hints = BALANCE_HINTS.get(scenario.id);

      it("has balance hints for every clue, referring to real news and assets", () => {
        assert.ok(hints, "register hints next to the scenario in server/scenarios/index.ts");
        const clueIds = scenario.clues.map((c) => c.id).sort();
        assert.deepEqual(Object.keys(hints.clues).sort(), clueIds);
        for (const hint of Object.values(hints.clues)) assert.ok(isAssetSymbol(hint.symbol));
        const newsIds = new Set(scenario.news.map((n) => n.id));
        for (const [newsId, symbol] of Object.entries(hints.praises)) {
          assert.ok(newsIds.has(newsId), `praises refers to unknown news id ${newsId}`);
          assert.ok(isAssetSymbol(symbol));
        }
      });

      it("meets every balance target on the demo seed", () => {
        const failed = checkBalance(simulate(scenario, hints!)).filter((c) => !c.ok);
        assert.deepEqual(
          failed.map((c) => `${c.name} (${c.detail})`),
          [],
          "tune perTick or shock values in small steps; run `pnpm balance` for the full table",
        );
      });

      it("stays balanced on most alternative seeds, not just the demo one", () => {
        const seeds = altSeeds(scenario);
        const passed = seeds.filter((seed) => checkBalance(simulate(scenario, hints!, seed)).every((c) => c.ok));
        assert.ok(passed.length >= seeds.length - 1, `all targets met on only ${passed.length}/${seeds.length} seeds`);
      });

      it("stays balanced with the Live Newsroom's price moves on", () => {
        const market = withNewsroom(scenario, resolveNewsroomPlan(scenario));
        const seeds = [scenario.seed, ...altSeeds(scenario)];
        const passed = seeds.filter((seed) => checkBalance(simulate(market, hints!, seed)).every((c) => c.ok));
        assert.ok(passed.length >= seeds.length - 1, `all targets met on only ${passed.length}/${seeds.length} seeds`);
      });
    });
  }
});
