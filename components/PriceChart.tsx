"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AssetSymbol } from "@/shared/assets";
import type { NewsItem } from "@/shared/types";
import { formatCredits, formatPct } from "@/lib/format";

interface Point {
  tick: number;
  price: number;
}

export function PriceChart({
  symbol,
  history,
  totalTicks,
  news,
  height = 260,
}: {
  symbol: AssetSymbol;
  history: number[];
  totalTicks: number;
  news: NewsItem[];
  height?: number;
}) {
  const data: Point[] = history.map((price, tick) => ({ tick, price: price / 100 }));
  const open = data[0]?.price ?? 0;
  const last = data[data.length - 1]?.price ?? open;
  const stroke = last >= open ? "var(--up)" : "var(--down)";
  const newsByTick = new Map(news.map((n) => [n.tick, n]));
  const maxTick = Math.max(totalTicks, data.length - 1);

  return (
    <div style={{ height }} role="img" aria-label={`${symbol} price history, ${formatPct(((last - open) / (open || 1)) * 100)} since open`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="tick"
            type="number"
            domain={[0, maxTick]}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
            tickFormatter={(t: number) => (t > totalTicks ? "Close" : `t${t}`)}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "var(--faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => v.toFixed(0)}
          />
          <ReferenceLine y={open} stroke="var(--faint)" strokeDasharray="4 4" />
          {news.map((n) => (
            <ReferenceLine
              key={n.id}
              x={n.tick}
              stroke="var(--warn)"
              strokeOpacity={0.45}
              strokeDasharray="2 3"
            />
          ))}
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as Point;
              const change = ((point.price - open) / (open || 1)) * 100;
              const headline = newsByTick.get(point.tick)?.headline;
              return (
                <div className="max-w-60 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs shadow-xl">
                  <div className="text-faint">{point.tick > totalTicks ? "Final (after reveal)" : `Tick ${point.tick}`}</div>
                  <div className="num text-sm font-semibold text-ink">{formatCredits(point.price * 100)}</div>
                  <div className="num text-muted">{formatPct(change)} vs open</div>
                  {headline && <div className="mt-1 border-t border-line pt-1 text-warn">📰 {headline}</div>}
                </div>
              );
            }}
          />
          <Line
            type="linear"
            dataKey="price"
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--panel)", strokeWidth: 2, fill: stroke }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
