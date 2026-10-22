# Market Mayhem

A multiplayer market simulation where information is imperfect, trust is risky, and every decision has consequences.

Players trade five fictional assets with virtual credits, react to public headlines, and weigh a **private clue that nobody else has**. When the bell rings, a hidden event resolves, and the strongest portfolio wins. The results screen then explains what really happened.

> Fictional educational simulation. Virtual credits only. Not financial advice.

## Quick start

```bash
pnpm install
pnpm dev          # Next.js on :3000 + game server on :4000
```

Open http://localhost:3000, create a room, then open the invite link in a **second browser window or tab** and join. Each tab is its own player, and a refresh keeps your seat.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Web app and game server with hot reload |
| `pnpm demo:fast` | Same, with a ~70 s trading phase for quick demos |
| `pnpm test` | Engine unit tests and a full multiplayer round over real sockets |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm build` and `pnpm start` | Production web build |
| `pnpm start:server` | Production game server |

To play from a phone on the same Wi-Fi, open `http://<your-LAN-IP>:3000`. The client connects to port 4000 on the same host automatically.

## What's in the demo

Everything in the blueprint's MVP scope:

- Guest identity with a server-issued player ID and a secret session token (stored in `sessionStorage`)
- Create and join rooms by 5-character code, ready-up, host start, and replay
- Five fictional assets with live prices, sparklines and a price chart. Headlines are marked on the chart.
- Buy and sell with a review/confirm step, fees and price impact, plus holdings and trade history
- Public news feed and a private clue card. Clues go only to the intended player.
- A server-authoritative timer and a state machine: `LOBBY → STARTING → ACTIVE → RESOLVING → FINISHED`
- Final ranking, every player's clue revealed ("who knew what"), a per-asset debrief and takeaways
- Reconnect: refreshing mid-round restores your room, portfolio and clue
- Seeded, reproducible market path (P1)

## Architecture

```
app/, components/, lib/   Next.js UI (client components), useGame socket hook
shared/                   Types, event names, Zod schemas, assets and rules shared by both sides
server/
  index.ts                Env config (Zod) and boot
  app.ts                  Express HTTP routes and Socket.IO handlers (validation, identity, rate limits)
  game/Room.ts            Room state machine, trading, ticking, scoring, results
  game/RoomManager.ts     Collision-checked room codes, idle-room cleanup
  engine/                 Pure functions: seeded RNG, price model, portfolio math, ranking
  scenarios/              Scenario configs (hidden truth). Server-only.
  test/                   node:test suites
docs/game-rules.md        Player-facing rules and the price model
```

**Server-authoritative.** The browser only sends intent (`symbol`, `side`, `quantity`, `requestId`, `roundId`). The server validates the payload with Zod, then checks membership, round state, deadline, cash and holdings. It sets the execution price and rejects duplicate request IDs. Cash, holdings, prices and scores never come from the client.

**Money** is stored as integer cents throughout, never floats.

### HTTP

| Route | Purpose |
| --- | --- |
| `GET /health` | Health check |
| `GET /api/assets` | Asset metadata and opening prices |
| `GET /api/rooms/:code` | Public room snapshot |
| `GET /api/rooms/:code/results` | Final results (409 until finished) |

Rooms are created and joined over Socket.IO (`room:create`, `room:join`), so creation is tied to the socket's guest identity.

### Socket.IO events

Client → server: `room:create`, `room:join`, `room:leave`, `player:ready`, `game:start`, `game:reset`, `trade:submit`, `game:requestState`

Server → client: `session`, `room:state`, `player:state` (private), `game:started`, `news:publish`, `clue:private` (private), `market:update`, `trade:result` (private), `game:finished`

Private events go to a per-player channel (`player:<id>`), never the room channel. Errors use structured codes such as `INSUFFICIENT_CASH`, `ROUND_CLOSED`, `INVALID_QUANTITY`, `NOT_IN_ROOM` and `DUPLICATE_REQUEST`.

## Environment

See `.env.example`.

| Variable | Use |
| --- | --- |
| `PORT` | Game server port (default 4000) |
| `CLIENT_ORIGIN` | Allowed frontend origin(s) for CORS, comma-separated |
| `NEXT_PUBLIC_SERVER_URL` | Game server URL used by the browser |
| `NODE_ENV` | development / production |
| `TICK_MS`, `STARTING_MS`, `RESOLVING_MS` | Round pacing |

## Deploying

Deploy the Next.js app anywhere (for example, Vercel). Deploy the game server to a host that supports long-running Node processes and WebSockets (Render, Fly.io, Railway). Set `NEXT_PUBLIC_SERVER_URL` on the web app and `CLIENT_ORIGIN` on the server.

## Known demo limits

- State is in memory. A server restart ends active rooms. PostgreSQL/Prisma persistence is the next step, and the `Room` class is the single place to add it.
- One scenario ("The Energy Shock"). New scenarios are plain config files in `server/scenarios/`.
- There is no AI. When AI explanations are added, they should only narrate results the engine already computed.
