# Scenario authoring

This is the contract between whoever writes a scenario and `server/test/scenarios.test.ts`, which enforces it. Agree on changes to it together.

## Adding a scenario

1. Create `server/scenarios/<name>.ts` that exports `<name>: ScenarioConfig` (see `server/scenarios/types.ts`). Use `energyShock.ts` as the example.
2. Register it in `server/scenarios/index.ts` by importing it and adding it to the `REGISTERED` array. That is the only line to change outside your file.
3. Run `pnpm test`. A failing `<id> satisfies the contract` test lists every rule the file breaks.
4. Run `pnpm demo:fast`. The host can now pick the scenario in the lobby.

Scenario files are server-only. They hold the hidden truth, so the web app must never import them. Before a round starts, the lobby only ever receives `id`, `name` and `teaser`.

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
