# Launch and demo-day checklist (U8)

## Before promoting to production

- [ ] `main` is green in CI (typecheck, lint, tests).
- [ ] The QA matrix ([qa-matrix.md](qa-matrix.md)) has no open P0 issues; P1s are fixed or accepted.
- [ ] Feature freeze announced (H22): only bug fixes merge after this.

## Production settings

**Game server (Render)**

- [ ] `NODE_ENV=production`
- [ ] `CLIENT_ORIGIN` is the exact production web URL (`https://…`, no trailing slash). The startup log line `allowed origins: …` shows it.
- [ ] `DATABASE_URL` (Supabase session pooler) and `DATABASE_CA_CERT`. The log shows `persistence: PostgreSQL`.
- [ ] Optional: `GEMINI_API_KEY`. The log shows `AI round summary: on (…)`.
- [ ] Start command `pnpm start:server`; health check `/health` returns `{"ok":true}`.

**Web app (Vercel)**

- [ ] `NEXT_PUBLIC_SERVER_URL` is the production Render URL (type **Config**). Redeploy after changing it.
- [ ] No secrets on Vercel: the database and Gemini keys live on Render only.

**Data**

- [ ] `pnpm db:migrate` is applied (it runs in the Render build when `DATABASE_URL` is set). Supabase shows the tables with row-level security on.

## Smoke test on production

- [ ] Create a room on a laptop, join from a phone on mobile data, and play a full round.
- [ ] The results screen loads; rows appear in Supabase → Table Editor.
- [ ] With the Gemini key: the AI-written summary appears and its numbers match the table.
- [ ] Tag the release: `git tag v1.0 && git push origin v1.0`.

## Demo-day safety net

- [ ] **10 minutes before:** open `https://<render-service>.onrender.com/health` to wake the free-tier server. A cold start can take close to a minute.
- [ ] **Pre-created room:** create a room on the presenting laptop, set the host's name, and pick the demo scenario in the lobby.
- [ ] **Known scenario:** use **The Energy Shock** (seed `energy-shock-demo-v1`). The same seed gives the same market every time, so the reveal is predictable.
- [ ] **Second player:** a second browser profile (or a phone) joined to the room before going on stage.
- [ ] **Local fallback:** `pnpm demo:fast` running on the laptop (about a 70 s trading phase), with two windows side by side.
- [ ] **Backup recording:** the screen recording of a full round is open and ready to play.

## Rehearsals (H26)

- [ ] Rehearsal 1 on production, timed against the 5-minute script ([../pitch/demo-script.md](../pitch/demo-script.md)).
- [ ] Rehearsal 2 on production, timed. Fix only what broke during the rehearsals.
