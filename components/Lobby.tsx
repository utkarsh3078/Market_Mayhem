"use client";

import { useState } from "react";
import { MAX_PLAYERS_PER_ROOM, STARTING_CASH } from "@/shared/rules";
import type { ScenarioListing } from "@/shared/types";
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

  async function pick(scenarioId: string) {
    if (scenarioId === room.scenario.id) return;
    const res = await actions.selectScenario(scenarioId);
    setError(res.ok ? null : res.error.message);
  }

  async function start() {
    const res = await actions.startGame();
    if (!res.ok) setError(res.error.message);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6">
      <nav className="flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <ConnectionDot status={state.connection} />
          <Button variant="ghost" className="px-3" onClick={() => actions.leaveRoom()}>
            Leave
          </Button>
        </div>
      </nav>

      <header className="mt-10 mb-8">
        <p className="eyebrow">Lobby</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">Gather your traders.</h1>
        <p className="mt-2 text-muted">Share the code, pick a scenario, and start when everyone is in.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="p-5 sm:p-6">
            <div className="eyebrow">Room code</div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
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
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                        p.id === myId ? "bg-ink text-white" : "bg-panel-2 text-ink"
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
                      <span className="rounded-full bg-panel-2 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-ink/70 uppercase">
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
                      <span className="font-semibold text-up">✓ Ready</span>
                    ) : (
                      <span className="text-muted">Not ready</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Scenario"
            action={isHost && room.scenarios.length > 1 ? <span className="text-xs text-faint">Host picks</span> : null}
          >
            {isHost ? (
              <ScenarioPicker scenarios={room.scenarios} selected={room.scenario.id} onPick={pick} />
            ) : (
              <div className="p-5">
                <h2 className="font-display text-3xl tracking-tight">{room.scenario.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{room.scenario.teaser}</p>
                {room.scenarios.length > 1 && <p className="mt-3 text-xs text-faint">The host chooses the scenario.</p>}
              </div>
            )}
          </Panel>

          <Panel title="Rules">
            <ol className="space-y-2.5 p-5 text-sm leading-relaxed text-muted">
              {RULES.map((rule, i) => (
                <li key={rule} className="flex gap-3">
                  <span className="font-mono text-xs leading-6 text-faint">0{i + 1}</span>
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
                  variant={me?.isReady ? "secondary" : "primary"}
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

function ScenarioPicker({
  scenarios,
  selected,
  onPick,
}: {
  scenarios: ScenarioListing[];
  selected: string;
  onPick: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Choose a scenario" className="flex flex-col gap-2 p-3">
      {scenarios.map((s) => {
        const active = s.id === selected;
        return (
          <button
            key={s.id}
            role="radio"
            aria-checked={active}
            onClick={() => onPick(s.id)}
            className={`flex gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              active ? "border-ink/70 bg-panel" : "border-line bg-bg hover:border-line-strong"
            }`}
          >
            <span
              className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                active ? "border-accent bg-accent" : "border-line-strong bg-panel"
              }`}
              aria-hidden="true"
            >
              {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-2xl leading-tight tracking-tight">{s.name}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{s.teaser}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
