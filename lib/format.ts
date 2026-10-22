// All amounts arrive as integer cents (1 credit = 100 cents).

const credits = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeCredits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCredits(cents: number, opts: { whole?: boolean } = {}): string {
  return (opts.whole ? wholeCredits : credits).format(cents / 100);
}

export function formatSigned(cents: number, opts: { whole?: boolean } = {}): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "±";
  return `${sign}${formatCredits(Math.abs(cents), opts)}`;
}

export function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

export function direction(value: number): "up" | "down" | "flat" {
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

export function toneClass(value: number): string {
  return value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted";
}

export function arrow(value: number): string {
  return value > 0 ? "▲" : value < 0 ? "▼" : "•";
}
