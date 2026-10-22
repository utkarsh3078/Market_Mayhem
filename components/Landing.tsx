"use client";

import { useEffect, useState } from "react";
import { ASSETS } from "@/shared/assets";
import { MAX_DISPLAY_NAME } from "@/shared/rules";
import { formatCredits } from "@/lib/format";
import type { GameActions, GameState } from "@/lib/useGame";
import { Button, ConnectionDot, Logo } from "./ui";

const NAME_KEY = "mm.name";

const STEPS = [
  { n: "01", title: "Join a room", body: "Create a room and share the 5-letter code. Everyone starts with 100,000 virtual credits." },
  { n: "02", title: "Read the news", body: "Public headlines hit everyone at once. Some are noise. Some are the start of a trend." },
  { n: "03", title: "Guard your clue", body: "Each player gets a different private clue. Some are solid, some are rumors. Nobody sees the full picture." },
  { n: "04", title: "Trade and find out", body: "Buy and sell five fictional assets. At the bell, the hidden event resolves and the best portfolio wins." },
];

export function Landing({ state, actions }: { state: GameState; actions: GameActions }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  // Restore the remembered name and any invite code from the URL (client-only values).
  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem(NAME_KEY) ?? "";
    } catch {}
    const invite = new URLSearchParams(window.location.search).get("room") ?? "";
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from browser storage */
    if (stored) setName(stored);
    if (invite) setCode(invite.toUpperCase().slice(0, 5));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const connected = state.connection === "connected" && !!state.session;
  const trimmed = name.trim();

  async function run(kind: "create" | "join") {
    if (!trimmed) {
      setError("Enter a display name first.");
      return;
    }
    if (kind === "join" && code.trim().length !== 5) {
      setError("Room codes are 5 letters/numbers.");
      return;
    }
    setError(null);
    setBusy(kind);
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {}
    const res = kind === "create" ? await actions.createRoom(trimmed) : await actions.joinRoom(code.trim(), trimmed);
    setBusy(null);
    if (!res.ok) setError(res.error.message);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
      <nav className="flex items-center justify-between">
        <Logo />
        <ConnectionDot status={state.connection} />
      </nav>

      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_1fr] lg:py-16">
        <section>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-intel/40 bg-intel/10 px-3 py-1 text-xs font-medium text-intel">
            <span className="h-1.5 w-1.5 rounded-full bg-intel" /> Multiplayer · 5-minute rounds · No real money
          </p>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Markets run on information.
            <br />
            <span className="text-muted">Yours is incomplete.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            A social-deduction trading game. Trade fictional assets, read the news, weigh a private clue that
            nobody else has, and finish with the strongest portfolio.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {ASSETS.map((a) => (
              <span key={a.symbol} className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs">
                <span className="font-mono font-semibold">{a.symbol}</span>{" "}
                <span className="text-muted">{a.name}</span>{" "}
                <span className="num text-faint">{formatCredits(a.initialPrice)}</span>
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/40 sm:p-6">
          <label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Display name
          </label>
          <input
            id="name"
            value={name}
            maxLength={MAX_DISPLAY_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(code ? "join" : "create")}
            placeholder="e.g. Ada"
            autoComplete="nickname"
            className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-3 text-base outline-none placeholder:text-faint focus:border-accent"
          />

          <Button className="mt-4 w-full py-3" disabled={!connected || busy !== null} onClick={() => run("create")}>
            {busy === "create" ? "Creating…" : "Create a room"}
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" /> or join a friend <span className="h-px flex-1 bg-line" />
          </div>

          <div className="flex gap-2">
            <label htmlFor="code" className="sr-only">
              Room code
            </label>
            <input
              id="code"
              value={code}
              maxLength={5}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && run("join")}
              placeholder="ROOM CODE"
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-3 font-mono text-base tracking-[0.3em] uppercase outline-none placeholder:tracking-normal placeholder:text-faint focus:border-accent"
            />
            <Button variant="secondary" disabled={!connected || busy !== null} onClick={() => run("join")}>
              {busy === "join" ? "Joining…" : "Join"}
            </Button>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
              {error}
            </p>
          )}
          {!connected && state.connection !== "connecting" && (
            <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
              Can&apos;t reach the game server. Is it running on port 4000? (<code>pnpm dev</code> starts both.)
            </p>
          )}
        </section>
      </div>

      <section className="grid gap-3 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-xl border border-line bg-panel/60 p-4">
            <div className="font-mono text-xs text-intel">{s.n}</div>
            <h3 className="mt-1 font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-8 text-center text-xs text-faint">
        Fictional educational simulation. All assets, prices and events are made up. Virtual credits only. Not
        financial advice.
      </footer>
    </main>
  );
}
