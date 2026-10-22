"use client";

import type { ConnectionStatus, Toast } from "@/lib/useGame";

export function Panel({
  title,
  action,
  className = "",
  children,
  tone,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  tone?: "intel";
}) {
  const border = tone === "intel" ? "border-intel/40" : "border-line";
  return (
    <section className={`rounded-xl border ${border} bg-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "buy" | "sell" | "intel";
}) {
  const styles: Record<string, string> = {
    primary: "bg-accent text-bg hover:bg-accent/85",
    secondary: "border border-line bg-panel-2 text-ink hover:border-muted",
    ghost: "text-muted hover:text-ink",
    buy: "bg-up text-bg hover:bg-up/85",
    sell: "bg-down text-bg hover:bg-down/85",
    intel: "bg-intel text-bg hover:bg-intel/85",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
  valueClass = "",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
      <div className={`num truncate text-lg font-semibold sm:text-xl ${valueClass}`}>{value}</div>
      {sub && <div className="num text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const map = {
    connected: { color: "bg-up", label: "Live" },
    connecting: { color: "bg-warn", label: "Connecting" },
    disconnected: { color: "bg-down", label: "Reconnecting" },
  } as const;
  const { color, label } = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
      <span className={`h-2 w-2 rounded-full ${color} ${status === "connected" ? "" : "animate-pulse"}`} />
      {label}
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono font-bold tracking-tight">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="var(--panel-2)" stroke="var(--line)" />
        <polyline
          points="4,16 9,11 12,14 19,6"
          fill="none"
          stroke="var(--up)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="19" cy="6" r="1.8" fill="var(--intel)" />
      </svg>
      {!compact && (
        <span>
          MARKET<span className="text-intel">MAYHEM</span>
        </span>
      )}
    </span>
  );
}

const TOAST_TONES: Record<Toast["tone"], string> = {
  info: "border-line",
  up: "border-up/60",
  down: "border-down/60",
  warn: "border-warn/60",
  intel: "border-intel/60",
};

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-80"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`toast-in pointer-events-auto w-full rounded-lg border-l-4 ${TOAST_TONES[t.tone]} border border-line bg-panel-2/95 px-4 py-3 text-left shadow-xl backdrop-blur`}
        >
          <div className="text-sm font-semibold">{t.title}</div>
          {t.body && <div className="mt-0.5 text-xs text-muted">{t.body}</div>}
        </button>
      ))}
    </div>
  );
}

export function Sparkline({
  values,
  width = 96,
  height = 28,
  total,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Total expected points, so the line fills left-to-right as the round progresses. */
  total?: number;
}) {
  const points = values.filter((v) => v !== undefined && v !== null);
  if (points.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const n = Math.max(total ?? points.length, points.length) - 1;
  const coords = points
    .map((v, i) => `${((i / n) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={coords}
        fill="none"
        stroke={up ? "var(--up)" : "var(--down)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ConfidenceBadge({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  const styles = {
    HIGH: "border-up/50 text-up",
    MEDIUM: "border-warn/50 text-warn",
    LOW: "border-down/50 text-down",
  } as const;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[level]}`}>
      {level.toLowerCase()} confidence
    </span>
  );
}
