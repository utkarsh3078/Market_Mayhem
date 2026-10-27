# Scenario authoring

This is the contract between whoever writes a scenario and `server/test/scenarios.test.ts`, which enforces it. Agree on changes to it together.

## Adding a scenario

1. Create `server/scenarios/<name>.ts` with two exports (copy the shape of `energyShock.ts`):
   - `<name>: ScenarioConfig`, the scenario itself;
   - `<name>Hints: BalanceHints`. For each clue, the trade a player acting only on that clue would make (`BUY` an asset, or `AVOID` it, since there is no short selling). For each headline that *praises* a company, that company.
2. Register both in `server/scenarios/index.ts` with one line in `REGISTERED`: `{ config: <name>, hints: <name>Hints }`.
3. Run `pnpm test`. It checks the contract below and the balance targets. A failure names every rule the file breaks.
4. Run `pnpm balance` to see the full strategy table, and tune until every target passes.
5. Play it with `pnpm demo:fast`. The host can pick it in the lobby.

Scenario files are server-only. They hold the hidden truth, so the web app must never import them. Before a round starts, the lobby only ever receives `id`, `name` and `teaser`. The hints are a separate export for the same reason: clue and news objects are sent to players as-is.

## Contract (machine-checked)

| Field | Rule |
| --- | --- |
| `id`, `version`, `seed` | `id` is kebab-case and unique across the registry; `version` starts at 1; `seed` is a unique string. |
| `totalTicks` | 90, so every scenario has the same round length as The Energy Shock. |
| `events` | 6–8 events; `0 ≤ startTick < endTick ≤ totalTicks`; every `|perTick| ≤ 0.007`; only the five known symbols. |
| `news` | 8–10 items; unique ids; ticks between 1 and `totalTicks − 2`; at least one item by tick 6, so the feed is never empty. |
| `clues` | Exactly 5, unique ids; at least one `HIGH` and at least one `LOW`; every field non-empty. |
| `resolution` | `|shock| ≤ 0.10` for every asset; explanations for all of NVE, CLD, AGR, QTM, MTB; 3–4 lessons. |
| price path | `generatePricePath` stays inside `priceBounds` for every asset, and the same seed produces an identical path twice. |

Suggested values: `noise: 0.004`, `marketNoise: 0.0015`.

## Design rules (checked by people, not tests)

- Decide the hidden truth before writing news and clues. Every headline is either caused by an event or is deliberate noise.
- Each of the five clues points at a different asset, so every player has a different edge.
- The `LOW`-confidence clue is the false rumor. No single clue reveals the full outcome or guarantees a win.
- The resolution text explains why each asset moved, in one or two plain sentences. That is the learning moment.
- Fictional companies, fictional events, no real brands or people. Label it as an educational simulation, never advice.

## Balance targets (machine-checked)

`pnpm balance` plays three fixed strategies on the scenario's real price path: the **holder** (never trades), the **headline chaser** (moves everything into each praised company two ticks after the headline), and the **clue follower** (acts once at the open on their own clue). `pnpm test` requires these on the demo seed, and on at least 5 of 6 alternative seeds:

- Clue followers beat the holder on average.
- Following the HIGH-confidence clue pays.
- The headline chaser is not the best strategy.
- The holder never wins outright.
- The LOW-confidence rumor never beats the HIGH clue.

**The tuning rule that fixes most failures:** good news should move the price mostly *before* its headline, when only clue holders know, and the misleading headline should peak and reverse soon after. If a price move starts the moment its headline is published, chasing headlines wins, and the scenario teaches the wrong lesson. Adjust `perTick`, event windows or `shock` in small steps, and bump `version` when you change a published scenario.
