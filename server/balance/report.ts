import { BALANCE_HINTS, SCENARIOS } from "../scenarios";
import { altSeeds, checkBalance, simulate } from "./simulate";

// `pnpm balance`: prints each scenario's strategy results (the F5 balance sheet) and its targets,
// on the demo seed and on alternative seeds.

const credits = (cents: number) => `${cents >= 0 ? "+" : "−"}${Math.abs(cents / 100).toFixed(0)}`.padStart(8);

let failures = 0;
for (const scenario of SCENARIOS.values()) {
  const hints = BALANCE_HINTS.get(scenario.id);
  if (!hints) {
    console.log(`\n${scenario.name}: no balance hints registered`);
    failures += 1;
    continue;
  }
  const run = simulate(scenario, hints);
  console.log(`\n${scenario.name} (${scenario.id}, seed ${scenario.seed})`);
  console.log(`  Holder           ${credits(run.holder)}`);
  console.log(`  Headline chaser  ${credits(run.chaser)}`);
  for (const c of run.clues) {
    console.log(`  Clue ${c.confidence.padEnd(6)} ${`${c.action} ${c.symbol}`.padEnd(10)} ${credits(c.pnl)}   (${c.clueId})`);
  }
  for (const check of checkBalance(run)) {
    console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
    if (!check.ok) failures += 1;
  }
  const seeds = altSeeds(scenario);
  const passed = seeds.filter((seed) => checkBalance(simulate(scenario, hints, seed)).every((c) => c.ok)).length;
  console.log(`  Alternative seeds: all targets met on ${passed}/${seeds.length}`);
}
console.log(failures ? `\n${failures} balance target(s) missed.` : "\nAll balance targets met on the demo seeds.");
process.exitCode = failures ? 1 : 0;
