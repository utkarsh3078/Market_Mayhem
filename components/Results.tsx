"use client";

import { useState } from "react";
import { ASSET_BY_SYMBOL } from "@/shared/assets";
import { arrow, formatCredits, formatPct, formatSigned, toneClass } from "@/lib/format";
import type { GameActions, GameState } from "@/lib/useGame";
import { Button, ConfidenceBadge, ConnectionDot, Logo, Panel, Sparkline } from "./ui";

export function Results({ state, actions }: { state: GameState; actions: GameActions }) {
  const room = state.room!;
  const results = room.results!;
  const myId = state.session!.playerId;
  const isHost = room.hostPlayerId === myId;
  const mine = results.leaderboard.find((r) => r.playerId === myId);
  const history = room.market?.history;
  const [copied, setCopied] = useState(false);

  async function share() {
    if (!mine) return;
    const text = `Market Mayhem · ${room.scenario.name}: I finished #${mine.rank} of ${results.leaderboard.length} with ${formatPct(mine.returnPct)} (${formatSigned(mine.pnl, { whole: true })} credits).`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      actions.toast({ tone: "info", title: "Your result", body: text });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
      <nav className="flex items-center justify-between">
        <Logo />
        <ConnectionDot status={state.connection} />
      </nav>

      {/* Hero: rank + event reveal */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel className="flex flex-col justify-between p-6">
          <div>
            <div className="eyebrow">Your finish</div>
            {mine ? (
              <>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="font-display text-7xl leading-none tracking-tight">#{mine.rank}</span>
                  <span className="text-muted">of {results.leaderboard.length}</span>
                </div>
                <div className={`num mt-3 text-3xl font-bold ${toneClass(mine.pnl)}`}>
                  {arrow(mine.pnl)} {formatPct(mine.returnPct)}
                </div>
                <div className="num mt-1 text-sm text-muted">
                  {formatSigned(mine.pnl)} P&amp;L · final value {formatCredits(mine.portfolioValue)}
                </div>
              </>
            ) : (
              <p className="mt-2 text-muted">You watched this round.</p>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {isHost ? (
              <Button onClick={() => actions.resetGame()}>Play again</Button>
            ) : (
              <span className="self-center text-sm text-muted">Waiting for the host to start another round…</span>
            )}
            <Button variant="secondary" onClick={share}>
              {copied ? "Copied ✓" : "Share result"}
            </Button>
            <Button variant="ghost" onClick={() => actions.leaveRoom()}>
              Leave room
            </Button>
          </div>
        </Panel>

        <Panel tone="intel" className="border-t-[3px] border-t-accent p-6 sm:p-8">
          <div className="eyebrow text-accent-ink">The hidden event</div>
          <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">{results.reveal.headline}</h1>
          <p className="mt-3 leading-relaxed text-muted">{results.reveal.summary}</p>
        </Panel>
      </section>

      {/* Optional AI recap: only narrates the results below, and is hidden if unavailable. */}
      {results.aiSummary && results.aiSummary.status !== "unavailable" && (
        <Panel
          title="AI-written summary"
          action={<span className="text-xs text-faint">Narrates the results below</span>}
          className="p-0"
        >
          <div className="px-5 py-4" aria-live="polite">
            {results.aiSummary.status === "pending" ? (
              <p className="animate-pulse text-sm text-faint">Writing a short summary of the round…</p>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-line">{results.aiSummary.text}</p>
            )}
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Leaderboard with "who knew what" */}
        <Panel title="Final ranking · who knew what">
          <ol className="divide-y divide-line">
            {results.leaderboard.map((r) => (
              <li key={r.playerId} className={`px-5 py-3.5 ${r.playerId === myId ? "bg-bg" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="num w-8 font-display text-2xl text-muted">#{r.rank}</span>
                    <span className="truncate font-semibold">
                      {r.displayName}
                      {r.playerId === myId && <span className="font-normal text-muted"> (you)</span>}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`num block font-semibold ${toneClass(r.pnl)}`}>{formatPct(r.returnPct)}</span>
                    <span className="num block text-xs text-faint">
                      {formatCredits(r.portfolioValue, { whole: true })} · {r.tradeCount} trades
                    </span>
                  </span>
                </div>
                {r.clueTitle && (
                  <div className="mt-2 ml-11 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-accent-ink">{r.clueTitle}</span>
                      {r.clueConfidence && <ConfidenceBadge level={r.clueConfidence} />}
                    </div>
                    <p className="mt-1 text-muted">{r.clueContent}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="What you can take away">
          <ul className="space-y-3 p-5">
            {results.reveal.lessons.map((lesson) => (
              <li key={lesson} className="flex gap-3 text-sm leading-relaxed">
                <span className="font-mono text-xs leading-6 text-accent" aria-hidden="true">
                  ◆
                </span>
                {lesson}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Per-asset debrief */}
      <Panel title="How each asset moved">
        <div className="divide-y divide-line">
          {results.reveal.assets.map((a) => {
            const asset = ASSET_BY_SYMBOL[a.symbol];
            return (
              <div key={a.symbol} className="grid gap-3 px-5 py-4 md:grid-cols-[180px_140px_1fr] md:items-center">
                <div>
                  <div className="font-mono font-semibold">{a.symbol}</div>
                  <div className="text-xs text-muted">{asset.name}</div>
                  <div className={`num mt-1 text-sm font-semibold ${toneClass(a.changePct)}`}>
                    {arrow(a.changePct)} {formatPct(a.changePct)}
                  </div>
                </div>
                <div>
                  {history && <Sparkline values={history[a.symbol]} width={130} height={36} />}
                  <div className="num mt-1 text-[11px] text-faint">
                    {formatCredits(a.openPrice)} → {formatCredits(a.finalPrice)}
                    <br />
                    peak {formatCredits(a.peakPrice)} · low {formatCredits(a.troughPrice)}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted">{a.explanation}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      {state.me && state.me.trades.length > 0 && (
        <Panel title={`Your trades (${state.me.trades.length})`}>
          <ul className="grid gap-x-6 divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
            {[...state.me.trades].reverse().map((t) => (
              <li key={t.id} className="flex justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span className={`mr-2 text-xs font-bold ${t.side === "BUY" ? "text-up" : "text-down"}`}>{t.side}</span>
                  <span className="num">{t.quantity}</span> <span className="font-mono">{t.symbol}</span> @{" "}
                  <span className="num">{formatCredits(t.price)}</span>
                </span>
                <span className="num text-xs text-faint">tick {t.tick}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <footer className="pb-4 text-center text-xs text-faint">
        Fictional educational simulation. Prices come from a deterministic scenario engine, not real markets.
      </footer>
    </main>
  );
}
