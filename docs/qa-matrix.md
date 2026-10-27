# QA matrix (staging pass, F7)

Run every row on **staging** with two devices, one of them a phone on mobile data. Mark each row ✅ pass or ❌ fail. Every ❌ gets a GitHub issue using the bug template at the bottom. "Auto" names the `pnpm test` case that already covers the row; still check it by hand on staging.

Tip: Chrome DevTools → Network → WS shows the WebSocket frames for the privacy rows.

| # | Area | Test (steps) | Expected | Auto | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | Room | Join with a code that doesn't exist, e.g. `ZZZZZ`. | Clear "No room with that code exists" error; no room is created. | integration: multiplayer round | |
| 2 | Room | Start a round, then try to join from a third browser. | Rejected with "A round is already in progress". | integration: multiplayer round | |
| 3 | Room | Refresh a player's tab mid-round, then rejoin. | The player keeps their seat, portfolio and clue (reconnect is allowed). | integration: multiplayer round | |
| 4 | Room | Have 8 players join, then a 9th. | The 9th is rejected: "That room is full." | integration: hardening | |
| 5 | Trade | Buy more than your cash allows. | Rejected; cash and holdings unchanged. | integration: multiplayer round | |
| 6 | Trade | Sell more shares than you hold. | Rejected; holdings unchanged. | integration: multiplayer round | |
| 7 | Trade | Try quantities 0, a decimal, and 99999. | The form refuses them, or the server rejects them with a clear message. | integration: multiplayer round | |
| 8 | Trade | Double-click Confirm quickly. | Only one trade executes (one row in Trades). | Partly: hardening tests a resent order (same requestId), not a UI double-click | |
| 9 | Round | Keep the order form open as the timer hits zero, then confirm. | Rejected: "Trading is closed right now." | integration: hardening | |
| 10 | Realtime | Watch the same company on both devices for 30 s. | Both show the same prices and the same headlines at the same time. | — | |
| 11 | Privacy | On device A, read the WS frames for `clue:private`. | Device A only ever receives its own clue. No other player's clue text appears until the results screen. | scenarios: multi-scenario rooms | |
| 12 | Privacy | In the lobby, check the `room:state` frames. | Only each scenario's name and teaser; no news, clues or outcome text. | scenarios: multi-scenario rooms | |
| 13 | Scoring | Note cash and holdings mid-round. | Portfolio value = cash + shares × current price; P&L = value − 100,000. | engine: calculatePortfolioValue | |
| 14 | Scenarios | Play each of the 4 scenarios once (host picks in the lobby). | The right news, clues and debrief for the chosen scenario; the guest sees the host's choice. | scenarios + balance | |
| 15 | Persistence | Finish a round, then open Supabase → Table Editor. | New rows in `GameRoom`, `Trade` and `GameResult`. | persistence: records the round | |
| 16 | Persistence | Wait until the room has left memory (or restart the server), then open `/api/rooms/<code>/results`. | The saved results load. | persistence: results fallback | |
| 17 | Persistence | (Optional) Break `DATABASE_URL` on staging and play a round. | The game still completes; errors only appear in the server log. | persistence: in the game loop | |
| 18 | Mobile | Play a full round on a 375 px-wide phone. | Every screen is usable with no sideways scrolling; the private clue shows at the top of the trading screen. | — | |
| 19 | Accessibility | Check prices, P&L and the leaderboard. | Every up/down move shows a + / − sign or an arrow, not colour alone. | — | |
| 20 | Deployment | Use the production URL on two networks for a full round. | A stable connection, with no WebSocket 400 errors in the console. | integration: allowed origins | |
| 21 | AI summary | With `GEMINI_API_KEY` set, finish a round. | An "AI-written summary" card appears within about 10 s, and every number in it matches the results. Without the key, no card appears. | debrief tests | |
| 22 | Demo | Run the demo scenario twice from scratch. | The same outcome and reveal both times, with no manual database edits. | engine: generatePricePath (same seed) | |

## Bug template

```
Title: [Area] short description          Severity: P0 / P1 / P2
Where: local | staging | production — browser, device
Steps: 1. ... 2. ... 3. ...
Expected: ...
Actual: ...
Evidence: screenshot, or the WS frame from DevTools → Network → WS
```

P0 = breaks a round or leaks private info · P1 = wrong but playable · P2 = cosmetic
