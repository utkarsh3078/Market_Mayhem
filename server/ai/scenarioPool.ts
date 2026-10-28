import type { ScenarioConfig } from "../scenarios/types";

export type ScenarioSource = "gemma" | "fallback";

export interface AcquiredScenario {
  scenario: ScenarioConfig;
  source: ScenarioSource;
}

export interface ScenarioPoolOptions {
  /** Writes one validated scenario. Throws when the model is unavailable or keeps failing validation. */
  generate: (theme?: string) => Promise<ScenarioConfig>;
  /** Built-in scenarios used when Gemma cannot deliver in time. */
  fallbacks: ScenarioConfig[];
  /** How many ready scenarios to keep on hand (0 disables background generation). */
  targetSize?: number;
  /** How long a host waits for Gemma before a built-in scenario is used instead. */
  acquireWaitMs?: number;
  /** Pause background refills after a failure so a broken model is not hammered. */
  retryBackoffMs?: number;
  random?: () => number;
  log?: (message: string) => void;
  now?: () => number;
}

const TIMED_OUT = Symbol("timed out");

/**
 * Keeps a few Gemma-written scenarios ready so starting an AI round is instant, writes extra ones
 * in the background (one at a time, to respect a shared free-tier key) and falls back to a built-in
 * scenario whenever Gemma is slow or down, so a room is never stuck waiting.
 */
export class ScenarioPool {
  private ready: ScenarioConfig[] = [];
  private refilling = false;
  private backoffUntil = 0;
  private stopped = false;
  private waiters: (() => void)[] = [];
  private readonly targetSize: number;
  private readonly acquireWaitMs: number;
  private readonly retryBackoffMs: number;
  private readonly random: () => number;
  private readonly log: (message: string) => void;
  private readonly now: () => number;

  constructor(private readonly options: ScenarioPoolOptions) {
    if (options.fallbacks.length === 0) throw new Error("ScenarioPool needs at least one fallback scenario");
    this.targetSize = options.targetSize ?? 2;
    this.acquireWaitMs = options.acquireWaitMs ?? 45_000;
    this.retryBackoffMs = options.retryBackoffMs ?? 60_000;
    this.random = options.random ?? Math.random;
    this.log = options.log ?? (() => {});
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.ready.length;
  }

  /** Starts filling the pool in the background. */
  warmUp(): void {
    this.refill();
  }

  stop(): void {
    this.stopped = true;
    this.notify();
  }

  /** Gives back a scenario nobody used, so the model call that wrote it is not wasted. */
  release(scenario: ScenarioConfig): void {
    if (this.stopped || this.ready.length >= Math.max(this.targetSize, 1)) return;
    this.ready.unshift(scenario);
    this.notify();
  }

  async acquire(theme?: string): Promise<{ scenario: ScenarioConfig; source: ScenarioSource }> {
    if (theme) return this.acquireThemed(theme);

    this.refill();
    if (this.ready.length === 0 && this.refilling) await this.waitForReady(this.acquireWaitMs);
    const scenario = this.ready.shift();
    if (scenario) {
      this.refill();
      return { scenario, source: "gemma" };
    }
    return this.fallback("no Gemma scenario was ready in time");
  }

  private async acquireThemed(theme: string): Promise<AcquiredScenario> {
    let abandoned = false;
    const writing = this.options.generate(theme);
    // If the host stops waiting, the late scenario still goes into the pool instead of being lost.
    writing.then(
      (late) => {
        if (abandoned) this.release(late);
      },
      () => {},
    );
    const result = await this.race(writing, this.acquireWaitMs, () => {
      abandoned = true;
    });
    if (result === TIMED_OUT) return this.fallback("themed scenario took too long");
    if (result instanceof Error) return this.fallback(`themed scenario failed: ${result.message}`);
    return { scenario: result, source: "gemma" };
  }

  private fallback(reason: string): AcquiredScenario {
    this.log(`ai: using a built-in scenario (${reason})`);
    const scenario = this.options.fallbacks[Math.floor(this.random() * this.options.fallbacks.length) % this.options.fallbacks.length];
    return { scenario, source: "fallback" };
  }

  private refill(): void {
    if (this.stopped || this.refilling || this.targetSize <= 0) return;
    if (this.ready.length >= this.targetSize || this.now() < this.backoffUntil) return;
    this.refilling = true;
    void (async () => {
      try {
        while (!this.stopped && this.ready.length < this.targetSize) {
          try {
            this.ready.push(await this.options.generate());
            this.notify();
          } catch (error) {
            this.backoffUntil = this.now() + this.retryBackoffMs;
            this.log(`ai: scenario generation failed (${error instanceof Error ? error.message : String(error)})`);
            break;
          }
        }
      } finally {
        this.refilling = false;
        this.notify();
      }
    })();
  }

  private notify(): void {
    const waiting = this.waiters.splice(0);
    for (const wake of waiting) wake();
  }

  private waitForReady(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      timer.unref();
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.waiters.push(done);
    });
  }

  private race<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T | typeof TIMED_OUT | Error> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        onTimeout();
        resolve(TIMED_OUT);
      }, ms);
      timer.unref();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          resolve(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}