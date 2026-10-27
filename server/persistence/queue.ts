/** One-line error text. Prisma errors keep the reason in `code` (e.g. ECONNREFUSED, P2002), not the message. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const message = error.message.replace(/\s+/g, " ").trim();
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && !message.includes(code) ? `${message} (${code})` : message;
}

/**
 * Runs async write jobs one at a time, in submission order, off the caller's path.
 * Ordering matters: a round's row must exist before its trades and results are written.
 * Failures are logged and the queue moves on; when the backlog is full, new jobs are dropped
 * (and logged) so a dead database can't grow memory without bound.
 */
export class WriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly log: (message: string) => void,
    private readonly maxPending = 1_000,
  ) {}

  get size(): number {
    return this.pending;
  }

  push(label: string, job: () => Promise<unknown>): void {
    if (this.pending >= this.maxPending) {
      this.log(`persistence queue full (${this.maxPending}); dropped ${label}`);
      return;
    }
    this.pending += 1;
    this.tail = this.tail
      .then(job)
      .then(
        () => undefined,
        (error: unknown) => this.log(`persistence ${label} failed: ${describeError(error)}`),
      )
      .finally(() => {
        this.pending -= 1;
      });
  }

  /** Resolves once every job queued so far has settled, or after timeoutMs. */
  async drain(timeoutMs = 5_000): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
      timer.unref();
    });
    await Promise.race([this.tail, timeout]);
    clearTimeout(timer);
  }
}
