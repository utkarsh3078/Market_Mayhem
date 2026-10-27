# Market Mayhem: game rules

A fictional, educational market simulation. Virtual credits only, no real money, not financial advice.

## The round

| Phase | Default length | What happens |
| --- | --- | --- |
| Lobby | until host starts | Players join with a 5-character room code. Non-hosts mark themselves ready. |
| Starting | 10 s | Prices are shown, and each player receives a private clue. Trading is locked. |
| Active | 90 ticks × 2 s = 3 min | Trading is open. Prices tick every 2 s, and headlines publish at fixed ticks. |
| Resolving | 4 s | Trading is locked. The hidden event resolves and final prices are applied. |
| Finished | until host replays | Leaderboard, every player's clue revealed, a per-asset debrief and lessons. |

## Money and trading

- Everyone starts with **100,000 credits** and no shares.
- You can only trade whole shares, up to 10,000 per order. There is no borrowing and no short selling.
- Every trade pays a **0.10% fee**.
- **Price impact:** each order nudges the price by `notional ÷ 1,000,000 credits`, capped at 3%. You are filled at the midpoint of the price before and after your order, so large orders cost more. The impact fades by 20% each tick.
- Portfolio value = cash + Σ(shares × current price). P&L = portfolio value − 100,000.
- The highest final portfolio value wins. Equal values share a rank.

## How prices move

For each asset, every tick:

```
return    = clamp(eventImpact + noise, −4%, +4%)
eventImpact = Σ per-tick drift of every scenario event active at this tick
noise     = seeded random in ±0.4% (asset) + ±0.15% (whole market)
nextPrice = clamp(price × (1 + return), 0.2 × open, 5 × open)
```

The underlying path is fully determined by the scenario seed. The same seed always produces the same market. Player trades add a temporary, decaying impact on top of that path. When the round closes, the hidden event applies a one-off shock to each asset.

## Information

- **Public news** is published to everyone at fixed ticks. Some headlines matter, some are noise, and some are already priced in by the time you read them.
- **Private clues** are dealt in join order from the scenario's clue list, so every player gets a different one (clues repeat when there are more than 5 players). Each clue has a confidence level. Some are reliable and one is a false rumor. No clue reveals the whole outcome.
- All clues are revealed on the results screen.

## Scenarios

The host picks one in the lobby. Each scenario file in `server/scenarios/` defines the hidden truth, the market events, the news, the five clues and the debrief. Scenario files are server-only and never ship to the browser; before a round, players only see a scenario's name and teaser.

| Scenario | Setup | Lesson |
| --- | --- | --- |
| The Energy Shock | A shipping disruption makes everyone fear an energy shortage. | A temporary shock and a lasting change look the same on day one. |
| The Rate Shock | Economists whisper about a steep interest-rate hike. | One event can push different sectors in opposite directions. |
| The Cloud Breach | CloudForge reports a security incident and the headlines are frightening. | Scary headlines move prices before the facts arrive. |
| The Battery Hype | Quantum Motors teases a battery breakthrough. | Hype against fundamentals: buy the rumor, sell the news. |

### Balance

Each scenario is tuned so that the private clue matters without guaranteeing a win. `pnpm balance` plays every scenario with three fixed strategies on its real price path:

- **Holder:** never trades.
- **Headline chaser:** two ticks after any headline praises a company, moves everything into it.
- **Clue follower:** acts once at the open on their own clue only (buying, or staying in cash when the clue is bearish, since there is no short selling).

The targets, checked by `pnpm test` on the demo seed and on alternative seeds:

- Clue followers beat the holder on average.
- Following the HIGH-confidence clue pays.
- The headline chaser is not the best strategy.
- The holder never wins outright.
- The LOW-confidence rumor never beats the HIGH clue.

## After the round

The results screen ranks every player, reveals each player's clue ("who knew what"), and explains how each company moved and why. If the server has a Gemini key, a short AI-written summary also appears. It only narrates these results: it can't change prices or scores, and it is discarded if it quotes any number that isn't in the results.
