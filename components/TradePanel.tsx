"use client";

import { useState } from "react";
import { ASSETS, type AssetSymbol } from "@/shared/assets";
import { FEE_BPS, MAX_ORDER_QUANTITY, tradeFee } from "@/shared/rules";
import type { AssetQuote, PrivatePlayerState, RoomStatus, TradeSide } from "@/shared/types";
import { formatCredits } from "@/lib/format";
import { Button, Panel } from "./ui";

export function TradePanel({
  symbol,
  onSymbolChange,
  quote,
  me,
  open,
  pending,
  status,
  onSubmit,
}: {
  symbol: AssetSymbol;
  onSymbolChange: (s: AssetSymbol) => void;
  quote: AssetQuote;
  me: PrivatePlayerState | null;
  open: boolean;
  pending: boolean;
  status: RoomStatus;
  onSubmit: (symbol: AssetSymbol, side: TradeSide, quantity: number) => void;
}) {
  const [side, setSide] = useState<TradeSide>("BUY");
  const [qtyText, setQtyText] = useState("10");
  const [reviewing, setReviewing] = useState(false);

  const quantity = Number(qtyText);
  const held = me?.holdings.find((h) => h.symbol === symbol)?.quantity ?? 0;
  const cash = me?.cash ?? 0;
  const notional = quote.price * (Number.isFinite(quantity) ? quantity : 0);
  const fee = tradeFee(notional);
  const estimate = side === "BUY" ? notional + fee : notional - fee;
  // Leave headroom for slippage: the server fills at the midpoint of the price move your order causes.
  const maxBuy = Math.max(0, Math.min(MAX_ORDER_QUANTITY, Math.floor(cash / (quote.price * 1.02))));
  const maxQty = side === "BUY" ? maxBuy : Math.min(held, MAX_ORDER_QUANTITY);

  let problem: string | null = null;
  if (!open) problem = status === "STARTING" ? "Trading opens when the countdown ends." : "Trading is closed.";
  else if (!Number.isInteger(quantity) || quantity <= 0) problem = "Enter a whole number of shares.";
  else if (quantity > MAX_ORDER_QUANTITY) problem = `Max ${MAX_ORDER_QUANTITY.toLocaleString()} shares per order.`;
  else if (side === "BUY" && estimate > cash) problem = "Not enough cash for this order.";
  else if (side === "SELL" && quantity > held) problem = held ? `You only hold ${held} ${symbol}.` : `You don't hold any ${symbol}.`;

  function confirm() {
    onSubmit(symbol, side, quantity);
    setReviewing(false);
  }

  return (
    <Panel title="Place order">
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1" role="radiogroup" aria-label="Order side">
          {(["BUY", "SELL"] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={side === s}
              onClick={() => {
                setSide(s);
                setReviewing(false);
              }}
              className={`rounded-md py-2 text-sm font-bold transition-colors ${
                side === s ? (s === "BUY" ? "bg-up text-bg" : "bg-down text-bg") : "text-muted hover:text-ink"
              }`}
            >
              {s === "BUY" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            Asset
            <select
              value={symbol}
              onChange={(e) => {
                onSymbolChange(e.target.value as AssetSymbol);
                setReviewing(false);
              }}
              className="w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink outline-none focus:border-accent"
            >
              {ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} · {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            Quantity
            <input
              inputMode="numeric"
              value={qtyText}
              onChange={(e) => {
                setQtyText(e.target.value.replace(/[^0-9]/g, ""));
                setReviewing(false);
              }}
              className="num w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[10, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => setQtyText(String(n))}
              className="num rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:border-muted hover:text-ink"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setQtyText(String(maxQty))}
            disabled={maxQty === 0}
            className="rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:border-muted hover:text-ink disabled:opacity-40"
          >
            Max ({maxQty})
          </button>
        </div>

        <dl className="num space-y-1 rounded-lg bg-bg px-3 py-2.5 text-sm">
          <Row label="Current price" value={formatCredits(quote.price)} />
          <Row label={`Fee (${FEE_BPS / 100}%)`} value={formatCredits(fee)} />
          <Row
            label={side === "BUY" ? "Estimated cost" : "Estimated proceeds"}
            value={formatCredits(Math.max(0, estimate))}
            strong
          />
          <Row label={side === "BUY" ? "Cash available" : "Shares held"} value={side === "BUY" ? formatCredits(cash) : String(held)} />
        </dl>

        {reviewing && !problem ? (
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-3" role="dialog" aria-label="Confirm trade">
            <p className="text-sm">
              {side === "BUY" ? "Buy" : "Sell"} <strong className="num">{quantity}</strong>{" "}
              <strong className="font-mono">{symbol}</strong> at about{" "}
              <strong className="num">{formatCredits(quote.price)}</strong> for about{" "}
              <strong className="num">{formatCredits(estimate)}</strong>?
            </p>
            <p className="mt-1 text-xs text-faint">
              The final price is set by the server and moves slightly with your order size.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setReviewing(false)}>
                Cancel
              </Button>
              <Button variant={side === "BUY" ? "buy" : "sell"} onClick={confirm} disabled={pending} autoFocus>
                Confirm
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant={side === "BUY" ? "buy" : "sell"}
            className="w-full py-3"
            disabled={!!problem || pending}
            onClick={() => setReviewing(true)}
          >
            {pending ? "Submitting…" : `Review ${side === "BUY" ? "buy" : "sell"}`}
          </Button>
        )}
        {problem && <p className="text-xs text-warn">{problem}</p>}
      </div>
    </Panel>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}
