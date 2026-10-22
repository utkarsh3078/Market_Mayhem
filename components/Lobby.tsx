"use client";

import { useState } from "react";
import { MAX_PLAYERS_PER_ROOM, STARTING_CASH } from "@/shared/rules";
import { formatCredits } from "@/lib/format";
import type { GameActions, GameState } from "@/lib/useGame";
import { Button, ConnectionDot, Logo, Panel } from "./ui";

const RULES = [
  `Everyone starts with ${formatCredits(STARTING_CASH, { whole: true })} credits and no shares.`,
  "Buy and sell whole shares of five fictional companies. No borrowing, no short selling.",
  "Every trade pays a 0.10% fee, and large orders move the price against you.",
  "Headlines are public. Your private clue is yours alone, and it may be wrong.",
  "When the timer ends, a hidden event resolves. Highest portfolio value wins.",
];

export function Lobby({ state, actions }: { state: GameState; actions: GameActions }) {
  const room = state.room!;
  const myId = state.session!.playerId;
  const me = room.players.find((p) => p.id === myId);
  const isHost = room.hostPlayerId === myId;
  const others = room.players.filter((p) => p.id !== room.hostPlayerId);
  const allReady = others.every((p) => p.isReady || !p.connected);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyInvite() {
    const link = `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(`Copy failed. Share this link: ${link}`);
    }
  }

  async function start() {
    const res = await actions.startGame();
    if (!res.ok) setError(res.error.message);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
      <nav className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <ConnectionDot status={state.connection} />
          <Button variant="ghost" className="px-2" onClick={() => actions.leaveRoom()}>
            Leave
          </Button>
        </div>
      </nav>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel className="p-5 sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Room code</div>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              <span className="font-mono text-5xl font-bold tracking-[0.2em] sm:text-6xl">{room.code}</span>
              <Button variant="secondary" onClick={copyInvite}>
                {copied ? "Link copied ✓" : "Copy invite link"}
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted">
              Open this in another browser or tab and join with the code. Up to {MAX_PLAYERS_PER_ROOM} players.
            </p>
          </Panel>

          <Panel title={`Players · ${room.players.length}/${MAX_PLAYERS_PER_ROOM}`}>
            <ul className="divide-y divide-line">
              {room.players.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                        p.id === myId ? "bg-accent text-bg" : "bg-panel-2 text-ink"
                      }`}
                      aria-hidden="true"
                    >
                      {p.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate font-medium">
                      {p.displayName}
                      {p.id === myId && <span className="text-muted"> (you)</span>}
                    </span>
                    {p.isHost && (
                      <span className="rounded-full border border-warn/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn">
                        Host
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs">
                    {!p.connected ? (
                      <span className="text-faint">Offline</span>
                    ) : p.isHost ? (
                      <span className="text-muted">Starts the round</span>
                    ) : p.isReady ? (
                      <span className="text-up">✓ Ready</span>
                    ) : (
                      <span className="text-muted">Not ready</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel tone="intel" className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-intel">Scenario</div>
            <h2 className="mt-1 text-2xl font-bold">{room.scenario.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{room.scenario.teaser}</p>
          </Panel>

          <Panel title="Rules">
            <ol className="space-y-2.5 p-4 text-sm leading-relaxed text-muted">
              {RULES.map((rule, i) => (
                <li key={rule} className="flex gap-3">
                  <span className="font-mono text-xs text-faint">{i + 1}.</span>
                  {rule}
                </li>
              ))}
            </ol>
          </Panel>

          <div className="flex flex-col gap-2">
            {isHost ? (
              <>
                <Button className="w-full py-3.5 text-base" onClick={start}>
                  Start round
                </Button>
                <p className="text-center text-xs text-muted">
                  {room.players.length === 1
                    ? "You can start solo, but it's more fun with a second player."
                    : allReady
                      ? "Everyone is ready."
                      : "Waiting on some players to ready up. You can still start."}
                </p>
              </>
            ) : (
              <>
                <Button
                  variant={me?.isReady ? "secondary" : "buy"}
                  className="w-full py-3.5 text-base"
                  onClick={() => actions.setReady(!me?.isReady)}
                >
                  {me?.isReady ? "Not ready" : "I'm ready"}
                </Button>
                <p className="text-center text-xs text-muted">The host starts the round.</p>
              </>
            )}
            {error && (
              <p role="alert" className="text-center text-sm text-down">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
