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
  const border = tone === "intel" ? "border-accent/35" : "border-line";
  return (
    <section className={`rounded-2xl border ${border} bg-panel shadow-card ${className}`}>
      {title && (
        <header className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-5 py-2.5">
          <h2 className={`eyebrow ${tone === "intel" ? "text-accent-ink" : ""}`}>{title}</h2>
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
    primary: "bg-ink text-white hover:bg-ink/85",
    secondary: "border border-line-strong bg-panel text-ink hover:border-ink/40",
    ghost: "text-muted hover:text-ink",
    buy: "bg-up text-white hover:bg-up/90",
    sell: "bg-down text-white hover:bg-down/90",
    intel: "bg-accent-ink text-white hover:bg-accent-ink/90",
  };
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  );
}

/** Soft label chip. Pass a bg-* class to change its fill (defaults to warm gray). */
export function Pill({ children, className = "bg-panel-2" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-ink/80 ${className}`}
    >
      {children}
    </span>
  );
}

/** Segmented control: a light track with the active option raised as a white pill. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  activeClass = "bg-panel text-ink shadow-sm",
  className = "",
}: {
  label: string;
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  activeClass?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid gap-1 rounded-full bg-panel-2 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            value === o.value ? activeClass : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
      <div className="eyebrow">{label}</div>
      <div className={`num mt-1 truncate text-lg font-semibold tracking-tight sm:text-2xl ${valueClass}`}>{value}</div>
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-panel-2 px-2.5 py-1 text-xs text-muted" role="status">
      <span className={`h-1.5 w-1.5 rounded-full ${color} ${status === "connected" ? "" : "animate-pulse"}`} />
      {label}
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="7" fill="var(--ink)" />
        <polyline
          points="5,15.5 9.5,11 12.5,13.5 18.5,7.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18.5" cy="7.5" r="1.9" fill="var(--accent)" />
      </svg>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight">
          Market <span className="font-display text-[19px] font-normal italic">Mayhem</span>
        </span>
      )}
    </span>
  );
}

const TOAST_TONES: Record<Toast["tone"], string> = {
  info: "bg-line-strong",
  up: "bg-up",
  down: "bg-down",
  warn: "bg-warn",
  intel: "bg-accent",
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
          className="toast-in pointer-events-auto flex w-full gap-3 rounded-2xl border border-line bg-panel/95 px-4 py-3 text-left shadow-card backdrop-blur"
        >
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TOAST_TONES[t.tone]}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{t.title}</span>
            {t.body && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t.body}</span>}
          </span>
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
    HIGH: "bg-up/10 text-up",
    MEDIUM: "bg-warn/10 text-warn",
    LOW: "bg-down/10 text-down",
  } as const;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[level]}`}>
      {level.toLowerCase()} confidence
    </span>
  );
}
