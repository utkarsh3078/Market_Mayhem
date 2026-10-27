# Demo script (5 minutes)

**Roles:** **A** presents and plays the host on the laptop (projected). **B** plays the second player on a phone and calls out what they see.
**Setup:** follow the demo-day safety net in [../docs/launch-checklist.md](../docs/launch-checklist.md). Run the round with `pnpm demo:fast` locally, or with a short `TICK_MS` on production, so trading lasts about 70 seconds.
**Scenario:** The Energy Shock (seed `energy-shock-demo-v1`, so the market is identical every run).
**Clues** are dealt in join order, so with two players A (the host) always gets "Backup route secured" and B gets "Industrial customer exposed". Don't swap devices: A must create the room.

| Time | Who | Click / do | Say |
| --- | --- | --- | --- |
| 0:00 | A | Show the landing page. | "Markets run on information, and yours is incomplete. This is Market Mayhem." |
| 0:15 | A | Enter a name, then **Create a room**. Read the code aloud. | "I create a room; it gives a five-letter code." |
| 0:30 | B | On the phone, enter the code and tap **Join**, then **I'm ready**. | "I join from my phone: no account, just a name." |
| 0:45 | A | In the lobby, pick **The Energy Shock**, then **Start round**. | "The host picks a scenario. Each one teaches a different lesson." |
| 1:00 | A | Point at the orange **Private clue** card ("Backup route secured"). | "Each of us just got a different private clue. Mine says a backup shipping route already exists. B's is different." |
| 1:15 | B | Read the top of the phone screen. | "Mine is pinned at the top. Nobody else can see it." |
| 1:30 | A | When **Energy shipments delayed** appears, point at Nova Energy spiking. | "The shortage headline hits everyone at once. Nova Energy jumps. The obvious move is to buy it." |
| 1:45 | B | Buy Nova Energy on the headline (review, then confirm). | "I'll chase the headline." |
| 2:00 | A | Don't buy Nova Energy. | "My clue says this disruption won't last, so I'm staying out of the spike." |
| 2:15–3:00 | A, B | Let the round run. Point at headlines as they land and at the live leaderboard. | "Some headlines matter, some are noise, and some are already priced in by the time you read them." |
| 3:00 | — | The bell rings: **Resolving**, then the results. | "At the bell the hidden event resolves." |
| 3:15 | A | Read the reveal headline: **The shortage never came**. | "The disruption was temporary: a backup route already existed." |
| 3:30 | A | Scroll to **Final ranking · who knew what**. | "Here is every clue. B chased the headline and Nova Energy fell about 13% from where they bought. My clue said the shock was temporary, so I stayed out and finished ahead." |
| 4:00 | A | Scroll to **How each asset moved** and read one explanation. | "Every price move is explained. That's the learning moment." |
| 4:30 | A | Back to the top. If the AI summary is on, point at it. | "A short AI-written recap narrates the results; it can't invent numbers." |
| 4:45 | A | Close. | "Four scenarios, five minutes each, no real money. Thank you." |

**If something breaks:**

- **The server is slow to wake:** keep talking through slide 5 and hit `/health` again.
- **The connection drops:** switch to the local `pnpm demo:fast` windows.
- **Anything else:** play the backup recording.
