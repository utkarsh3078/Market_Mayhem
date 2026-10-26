"use client";

import { useState } from "react";
import { ASSET_BY_SYMBOL, type AssetSymbol } from "@/shared/assets";
import type { AssetQuote, NewsItem, PrivateClue } from "@/shared/types";
import { arrow, formatCredits, formatPct, formatSigned, toneClass } from "@/lib/format";
import { formatClock, useCountdown } from "@/lib/useCountdown";
import type { GameActions, GameState } from "@/lib/useGame";
import { PriceChart } from "./PriceChart";
import { TradePanel } from "./TradePanel";
import { ConfidenceBadge, ConnectionDot, Logo, Panel, Sparkline, Stat } from "./ui";

export function Dashboard({ state, actions }: { state: GameState; actions: GameActions }) {
  const room = state.room!;
  const market = room.market;
  const me = state.me;
  const [selected, setSelected] = useState<AssetSymbol>("NVE");
  const remaining = useCountdown(room.phaseEndsAt, state.serverOffset);

  if (!market) return null;
  const quotes = new Map(market.quotes.map((q) => [q.symbol, q]));
  // Value holdings at live quotes; the private state only refreshes when you trade.
  const holdingsValue = me?.holdings.reduce((sum, h) => sum + h.quantity * (quotes.get(h.symbol)?.price ?? 0), 0) ?? 0;
  const portfolioValue = me ? me.cash + holdingsValue : 0;
  const pnl = portfolioValue - room.startingCash;
  const tradingOpen = room.status === "ACTIVE";
  const selectedAsset = ASSET_BY_SYMBOL[selected];
  const selectedQuote = quotes.get(selected)!;

  const phase =
    room.status === "STARTING"
      ? { label: "Market opens in", tone: "text-ink" }
      : room.status === "ACTIVE"
        ? { label: "Trading closes in", tone: remaining !== null && remaining <= 15 ? "text-warn" : "text-ink" }
        : { label: "Resolving", tone: "text-accent-ink" };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Top bar: room code • round timer • connection */}
      <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <Logo compact />
            <span className="hidden truncate font-display text-xl tracking-tight sm:inline">{room.scenario.name}</span>
            <span className="rounded-full bg-panel-2 px-2.5 py-0.5 font-mono text-xs text-muted">{room.code}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right" aria-live="off">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{phase.label}</div>
              <div className={`num font-mono text-xl font-bold leading-none ${phase.tone}`}>
                {room.status === "RESOLVING" ? "…" : formatClock(remaining)}
              </div>
            </div>
            <ConnectionDot status={state.connection} />
          </div>
        </div>
        <div className="h-0.5 bg-line">
          <div
            className="h-full bg-ink transition-[width] duration-500"
            style={{ width: `${Math.min(100, (market.tick / market.totalTicks) * 100)}%` }}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5">
        {room.status === "STARTING" && (
          <Banner tone="accent">
            <strong>The market opens in {remaining ?? "…"}s.</strong> Read the headlines and your private clue, then
            plan your first move.
          </Banner>
        )}
        {room.status === "RESOLVING" && (
          <Banner tone="intel">
            <strong>Closing bell.</strong> Trading is locked. The hidden event is resolving and final prices are being
            calculated…
          </Banner>
        )}

        {/* Portfolio strip */}
        <Panel className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat label="Cash" value={me ? formatCredits(me.cash) : "—"} />
          <Stat label="Holdings" value={me ? formatCredits(holdingsValue) : "—"} />
          <Stat label="Portfolio value" value={me ? formatCredits(portfolioValue) : "—"} />
          <Stat
            label="Unrealized P&L"
            value={me ? formatSigned(pnl) : "—"}
            valueClass={me ? toneClass(pnl) : ""}
            sub={me ? formatPct((pnl / room.startingCash) * 100) : undefined}
          />
        </Panel>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-2">
          {/* Main left: assets + chart */}
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title="Market" action={<span className="num text-xs text-faint">tick {market.tick}/{market.totalTicks}</span>}>
              <AssetTable
                quotes={market.quotes}
                history={market.history}
                totalTicks={market.totalTicks}
                selected={selected}
                onSelect={setSelected}
                holdings={new Map(me?.holdings.map((h) => [h.symbol, h.quantity]))}
              />
            </Panel>
            <Panel
              title={
                <span>
                  {selectedAsset.name} <span className="font-mono text-faint">({selected})</span>
                </span>
              }
              action={
                <span className={`num text-sm font-semibold ${toneClass(selectedQuote.change)}`}>
                  {formatCredits(selectedQuote.price)} {arrow(selectedQuote.change)} {formatPct(selectedQuote.changePct)}
                </span>
              }
            >
              <div className="px-2 pt-3 pb-1">
                <PriceChart
                  symbol={selected}
                  history={market.history[selected]}
                  totalTicks={market.totalTicks}
                  news={room.news}
                />
              </div>
              <p className="px-4 pb-3 text-xs text-faint">
                Sensitive to: {selectedAsset.sensitivity}. Dashed lines mark headlines.
              </p>
            </Panel>
          </div>

          {/* Main right: trade panel + positions */}
          <div className="flex min-w-0 flex-col gap-4">
            <TradePanel
              symbol={selected}
              onSymbolChange={setSelected}
              quote={selectedQuote}
              me={me}
              open={tradingOpen}
              pending={state.pendingTrades.length > 0}
              onSubmit={actions.submitTrade}
              status={room.status}
            />
            <Positions state={state} quotes={quotes} />
          </div>

          {/* Side: clue, news, leaderboard */}
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 xl:col-span-1">
            <ClueCard clue={state.clue} />
            <NewsFeed news={room.news} fresh={state.freshNewsId} />
            <Panel title="Leaderboard (live)">
              <ol className="divide-y divide-line">
                {room.leaderboard.map((entry) => (
                  <li
                    key={entry.playerId}
                    className={`flex items-center justify-between gap-2 px-4 py-2 text-sm ${
                      entry.playerId === state.session?.playerId ? "bg-bg font-semibold" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="num w-5 font-mono text-xs text-faint">#{entry.rank}</span>
                      <span className="truncate">{entry.displayName}</span>
                    </span>
                    <span className={`num text-xs ${toneClass(entry.pnl)}`}>{formatPct(entry.returnPct)}</span>
                  </li>
                ))}
                {room.leaderboard.length === 0 && <li className="px-4 py-3 text-sm text-faint">Waiting for the open…</li>}
              </ol>
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}

function Banner({ tone, children }: { tone: "accent" | "intel"; children: React.ReactNode }) {
  const style = tone === "accent" ? "border-line bg-panel-2" : "border-accent/30 bg-accent/8";
  return <div className={`rounded-2xl border px-5 py-3 text-sm leading-relaxed ${style}`}>{children}</div>;
}

function AssetTable({
  quotes,
  history,
  totalTicks,
  selected,
  onSelect,
  holdings,
}: {
  quotes: AssetQuote[];
  history: Record<AssetSymbol, number[]>;
  totalTicks: number;
  selected: AssetSymbol;
  onSelect: (s: AssetSymbol) => void;
  holdings: Map<AssetSymbol, number>;
}) {
  return (
    <div role="listbox" aria-label="Assets" className="divide-y divide-line">
      {quotes.map((q) => {
        const asset = ASSET_BY_SYMBOL[q.symbol];
        const held = holdings.get(q.symbol);
        const active = q.symbol === selected;
        return (
          <button
            key={q.symbol}
            role="option"
            aria-selected={active}
            onClick={() => onSelect(q.symbol)}
            className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors sm:grid-cols-[1fr_96px_auto] ${
              active ? "bg-bg shadow-[inset_3px_0_0_var(--ink)]" : "hover:bg-bg/70"
            }`}
          >
            <span className="min-w-0">
              <span className="font-mono font-semibold">{q.symbol}</span>
              {held ? <span className="ml-2 rounded-full bg-panel-2 px-2 py-0.5 text-[10px] font-medium text-ink/70">{held} held</span> : null}
              <span className="block truncate text-xs text-muted">
                {asset.name} · {asset.sector}
              </span>
            </span>
            <span className="hidden sm:block">
              <Sparkline values={history[q.symbol]} total={totalTicks + 1} />
            </span>
            <span className="text-right">
              <span className="num block font-semibold">{formatCredits(q.price)}</span>
              <span className={`num block text-xs ${toneClass(q.change)}`}>
                {arrow(q.change)} {formatPct(q.changePct)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Positions({ state, quotes }: { state: GameState; quotes: Map<AssetSymbol, AssetQuote> }) {
  const me = state.me;
  const [tab, setTab] = useState<"holdings" | "trades">("holdings");
  return (
    <Panel
      title={
        <span className="flex gap-3">
          {(["holdings", "trades"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`uppercase tracking-[0.14em] ${tab === t ? "text-ink" : "text-faint hover:text-muted"}`}
            >
              {t === "holdings" ? `Holdings (${me?.holdings.length ?? 0})` : `Trades (${me?.trades.length ?? 0})`}
            </button>
          ))}
        </span>
      }
    >
      {tab === "holdings" ? (
        <div className="max-h-64 overflow-auto">
          {!me?.holdings.length ? (
            <p className="px-4 py-4 text-sm text-faint">No positions yet. You&apos;re 100% cash.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Asset</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 text-right font-medium">Avg cost</th>
                  <th className="px-4 py-2 text-right font-medium">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {me.holdings.map((h) => {
                  const price = quotes.get(h.symbol)?.price ?? h.averageCost;
                  const pnl = (price - h.averageCost) * h.quantity;
                  return (
                    <tr key={h.symbol}>
                      <td className="px-4 py-2 font-mono font-semibold">{h.symbol}</td>
                      <td className="num px-2 py-2 text-right">{h.quantity}</td>
                      <td className="num px-2 py-2 text-right text-muted">{formatCredits(h.averageCost)}</td>
                      <td className={`num px-4 py-2 text-right ${toneClass(pnl)}`}>{formatSigned(pnl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <ul className="max-h-64 divide-y divide-line overflow-auto">
          {!me?.trades.length && <li className="px-4 py-4 text-sm text-faint">No trades yet.</li>}
          {me?.trades.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>
                <span className={`mr-2 text-xs font-bold ${t.side === "BUY" ? "text-up" : "text-down"}`}>{t.side}</span>
                <span className="num">{t.quantity}</span> <span className="font-mono">{t.symbol}</span>
                <span className="text-faint"> @ </span>
                <span className="num">{formatCredits(t.price)}</span>
              </span>
              <span className="num text-xs text-faint">t{t.tick}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ClueCard({ clue }: { clue: PrivateClue | null }) {
  const [hidden, setHidden] = useState(false);
  return (
    <Panel
      tone="intel"
      className="border-t-[3px] border-t-accent"
      title="Private clue · only you"
      action={
        clue && (
          <button className="rounded-full bg-panel-2 px-2.5 py-0.5 text-xs text-muted hover:text-ink" onClick={() => setHidden((h) => !h)}>
            {hidden ? "Reveal" : "Hide"}
          </button>
        )
      }
    >
      <div className="p-5">
        {!clue ? (
          <p className="text-sm text-faint">Your clue arrives when the round starts.</p>
        ) : hidden ? (
          <p className="text-sm text-faint">Hidden. Click reveal (and check nobody is looking).</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-2xl leading-tight tracking-tight">{clue.title}</h3>
              <ConfidenceBadge level={clue.confidence} />
            </div>
            <p className="mt-2 text-sm leading-relaxed">{clue.content}</p>
            <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-accent-ink">{clue.hint}</p>
          </>
        )}
      </div>
    </Panel>
  );
}

function NewsFeed({ news, fresh }: { news: NewsItem[]; fresh: string | null }) {
  const ordered = [...news].reverse();
  return (
    <Panel title="Public news" action={<span className="text-xs text-faint">{news.length} headlines</span>}>
      <ul className="max-h-80 divide-y divide-line overflow-auto" aria-live="polite">
        {ordered.length === 0 && <li className="px-4 py-4 text-sm text-faint">No headlines yet. Stay alert.</li>}
        {ordered.map((n) => (
          <li key={n.id} className={`px-4 py-3 ${n.id === fresh ? "flash-in" : ""}`}>
            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider">
              <span className="font-semibold tracking-[0.12em] text-ink/60">{n.category}</span>
              <span className="num text-faint">t{n.tick}</span>
            </div>
            <div className="mt-0.5 text-sm font-semibold leading-snug">{n.headline}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-muted">{n.body}</div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
