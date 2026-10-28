# Live Newsroom plan format

A scenario supplies its Live Newsroom stories through one optional field, `newsroom: { beats: NewsroomBeat[] }`. Hand-written and AI-generated scenarios use the same format, and the newsroom reads nothing else. The types and the Zod schema are in `shared/newsroom.ts`.

Every plan passes through `validateNewsroomPlan` (`server/newsroom/validate.ts`) before a round. Small problems are repaired and logged. A plan that can't be repaired is replaced by one built from the scenario's own `news` (`buildFallbackNewsroomPlan`), so a bad plan can never stop a round. Plans are fixed when the round starts.

## A beat

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string, 1–64 chars | Unique within the plan. |
| `airTick` | integer | Tick at which the anchor starts the story. |
| `kind` | `GENERAL` · `MARKET` · `NOISE` · `PRICED_IN` · `MISLEADING` | What the story really is. Players see this only after the round. |
| `category` | string | Picks the illustration: `weather`, `sports`, `culture`, `world`, `energy`, `shipping`, `farm`, `factory`, `tech`, `bank`, `market`. Anything else gets a plain card. |
| `headline` | string, ≤ 90 chars | Lower-third headline. |
| `facts` | string, ≤ 320 chars | The only facts the anchor may say, in 1–2 plain sentences. |
| `script` | string[], optional | Ready-made anchor lines, at most 4 of up to 220 chars each. Without it, a template (or the AI writer) builds lines from `headline` and `facts`. |
| `tone` | `urgent` · `calm` · `playful`, optional | A hint for the script writer. |
| `clusterId` | string, optional | Market beats that share it air back to back. |
| `effects` | array, optional | Price moves. Only `MARKET`, `PRICED_IN` and `MISLEADING` beats may have them. |

An effect is `{ symbol, driftPerTick, reactionDelayTicks, durationTicks, shape? }`:

- `symbol` is one of `NVE`, `CLD`, `AGR`, `QTM`, `MTB`.
- `driftPerTick` is added to that asset's return on each tick of the effect, for example `-0.004`.
- The move runs from tick `airTick + reactionDelayTicks` for `durationTicks` ticks. A `PRICED_IN` story uses a negative delay: the move happened before the news aired.
- `shape` is `STEP` (constant, the default), `RAMP` (builds up to the drift) or `SPIKE_REVERT` (moves, then gives it back). `MISLEADING` beats always use `SPIKE_REVERT`.

## Validator rules

The validator **repairs** these and logs a warning:

- A beat that fails the schema, has a duplicate id, or airs outside ticks 1 to `totalTicks − 3` is dropped.
- Text has HTML, markdown, links and emoji removed, and is cut at a word to the length limits. A beat whose headline or facts end up empty is dropped.
- Beats are sorted. Beats must be at least 2 ticks apart. When two are too close, a `GENERAL` or `NOISE` beat is dropped in favour of a market story, and a market story is pushed back.
- An effect with an unknown symbol, or one that would run past the closing bell, is dropped.
- `|driftPerTick|` is clamped to 0.007. `reactionDelayTicks` is clamped to 1–10, or −8 to 10 for `PRICED_IN`. `durationTicks` is clamped to 2–20.
- One beat can move one asset by at most 6% (|drift| × duration), and the whole plan by at most 12% per asset. Larger effects are scaled down.
- `GENERAL` and `NOISE` beats lose any effects. A `PRICED_IN` or `MISLEADING` beat with no effects becomes `NOISE`.
- If there are more than 14 beats, filler beats are dropped from the end.

The validator **rejects** the plan (and the fallback plan is used) when:

- the input isn't `{ beats: [...] }`, no beats survive, or fewer than half survive;
- there are fewer than 2 `GENERAL` beats or no `MARKET` beat.

A plan with no back-to-back cluster of market stories is accepted with a warning.

## Good plans (for a 90-tick round)

- 10–14 beats, about 40% `GENERAL`. Mild weather, sports and culture stories make it feel like a real channel.
- At least one each of `NOISE`, `PRICED_IN` and `MISLEADING`.
- At least one cluster of 2–3 `MARKET` beats, 4–6 ticks apart, where the second changes the meaning of the first.
- Market moves start 2–5 ticks after airing, so an attentive viewer has a window to act.
- Make cause and effect clear, including second-order effects (a drought hurts the farm company a lot and its lender a little).
- A story is read until the next beat airs: 2 s per tick at the default speed, so 5 ticks give about 10 s, or 2–3 short sentences. Keep `facts` short. Long scripts are cut to the whole lines that fit, and in fast demo mode often only the first line airs.
- Fictional companies and events only. Don't contradict the scenario's hidden truth, and keep newsroom effects small next to the final `resolution.shock`.

## Example

```json
{
  "beats": [
    {
      "id": "nr-weather",
      "airTick": 3,
      "kind": "GENERAL",
      "category": "weather",
      "headline": "Sunny spells expected along the coast this weekend",
      "facts": "Forecasters expect clear skies and light winds through Sunday."
    },
    {
      "id": "nr-drought",
      "airTick": 40,
      "kind": "MARKET",
      "category": "farm",
      "clusterId": "drought",
      "headline": "Drought warning issued for the southern farm belt",
      "facts": "Forecasters warn of weeks without rain. Crop growth could stall, and farm lenders may face late payments.",
      "effects": [
        { "symbol": "AGR", "driftPerTick": -0.004, "reactionDelayTicks": 3, "durationTicks": 6 },
        { "symbol": "MTB", "driftPerTick": -0.0015, "reactionDelayTicks": 4, "durationTicks": 5 }
      ]
    },
    {
      "id": "nr-rain",
      "airTick": 45,
      "kind": "MARKET",
      "category": "weather",
      "clusterId": "drought",
      "headline": "Forecast flips as heavy rain heads for the farm belt",
      "facts": "A new forecast shows heavy rain within days, and the drought warning has been lifted.",
      "effects": [{ "symbol": "AGR", "driftPerTick": 0.005, "reactionDelayTicks": 2, "durationTicks": 8, "shape": "RAMP" }]
    },
    {
      "id": "nr-dividend",
      "airTick": 60,
      "kind": "MISLEADING",
      "category": "bank",
      "headline": "Analyst says MetroBank could double its dividend",
      "facts": "A single analyst note predicts it. The bank has made no announcement.",
      "effects": [{ "symbol": "MTB", "driftPerTick": 0.005, "reactionDelayTicks": 1, "durationTicks": 8, "shape": "SPIKE_REVERT" }]
    },
    {
      "id": "nr-comet",
      "airTick": 78,
      "kind": "GENERAL",
      "category": "world",
      "headline": "Astronomers say a bright comet is visible after sunset",
      "facts": "It will be easiest to see from dark parks outside the city."
    }
  ]
}
```

The Energy Shock's full plan is at the end of `server/scenarios/energyShock.ts`.

## Prompting a model for a plan

Give the model this page, the scenario's hidden truth, its news and the five asset symbols. Ask for JSON only, in exactly this shape. Then pass the result to `validateNewsroomPlan` and log the warnings. They show what the model keeps getting wrong.
