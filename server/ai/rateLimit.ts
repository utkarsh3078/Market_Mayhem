// Keeps the AI summary inside the Gemini API key's quota. Every call must take a slot first; when
// none is free the call is skipped (players still get the built-in debrief), never queued or retried.
//
// Windows slide (the last 60 s, the last 24 h), which is stricter than Google's fixed minute and
// Pacific-time day: anything under the limit over any 24 h stretch is also under it for any calendar day.

export interface QuotaLimits {
  /** Requests per minute. */
  rpm: number;
  /** Tokens per minute (input + output + thinking). */
  tpm: number;
  /** Requests per day. */
  rpd: number;
}

/** The key's quota as configured in Google AI Studio. Override with GEMINI_RPM / GEMINI_TPM / GEMINI_RPD. */
export const DEFAULT_QUOTA: QuotaLimits = { rpm: 15, tpm: 250_000, rpd: 500 };

/** Use at most this share of each limit, leaving room for clock skew and stray calls (e.g. a dev server on the same key). */
const HEADROOM = 0.9;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How long to stop calling after the API answers 429 anyway. */
const COOLDOWN_MS = 60_000;

export class QuotaExceededError extends Error {}

/** A taken slot. Report the real token usage once known; until then the estimate counts. */
export interface QuotaSlot {
  settle(actualTokens: number): void;
}

interface Call {
  at: number;
  tokens: number;
}

export class QuotaLimiter {
  private readonly budget: QuotaLimits;
  private calls: Call[] = [];
  private pausedUntil = 0;

  constructor(limits: QuotaLimits = DEFAULT_QUOTA, private readonly now: () => number = Date.now) {
    this.budget = {
      rpm: Math.max(1, Math.floor(limits.rpm * HEADROOM)),
      tpm: Math.max(1, Math.floor(limits.tpm * HEADROOM)),
      rpd: Math.max(1, Math.floor(limits.rpd * HEADROOM)),
    };
  }

  get limits(): Readonly<QuotaLimits> {
    return this.budget;
  }

  /** Takes a slot for one request of about `estimatedTokens`, or throws QuotaExceededError saying which limit is full. */
  acquire(estimatedTokens: number): QuotaSlot {
    const now = this.now();
    this.calls = this.calls.filter((c) => c.at > now - DAY_MS);
    if (now < this.pausedUntil) {
      throw new QuotaExceededError(`rate limited by the API, paused for ${Math.ceil((this.pausedUntil - now) / 1000)} s`);
    }
    if (this.calls.length >= this.budget.rpd) {
      throw new QuotaExceededError(`daily budget used (${this.calls.length}/${this.budget.rpd} requests in 24 h)`);
    }
    const lastMinute = this.calls.filter((c) => c.at > now - MINUTE_MS);
    if (lastMinute.length >= this.budget.rpm) {
      throw new QuotaExceededError(`per-minute budget used (${lastMinute.length}/${this.budget.rpm} requests)`);
    }
    const tokens = lastMinute.reduce((sum, c) => sum + c.tokens, 0);
    if (tokens + estimatedTokens > this.budget.tpm) {
      throw new QuotaExceededError(`per-minute token budget used (${tokens}/${this.budget.tpm} tokens)`);
    }
    const call: Call = { at: now, tokens: estimatedTokens };
    this.calls.push(call);
    return {
      settle: (actualTokens) => {
        if (actualTokens > 0) call.tokens = actualTokens;
      },
    };
  }

  /** Counts requests made before this process started (times in ms), so a restart doesn't reset the daily budget. */
  seed(times: number[]): void {
    const since = this.now() - DAY_MS;
    this.calls.push(...times.filter((at) => at > since).map((at) => ({ at, tokens: 0 })));
    this.calls.sort((a, b) => a.at - b.at);
  }

  /** The API returned 429 despite the budget: stop calling for a while. */
  backOff(ms = COOLDOWN_MS): void {
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + ms);
  }
}

/** Rough token count for English text, rounded up so the estimate errs high (~4 chars per token in practice). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3);
