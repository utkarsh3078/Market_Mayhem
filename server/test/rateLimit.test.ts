import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QuotaExceededError, QuotaLimiter } from "../ai/rateLimit";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function limiter(limits = { rpm: 15, tpm: 250_000, rpd: 500 }) {
  let now = 1_000_000_000;
  const l = new QuotaLimiter(limits, () => now);
  return { l, advance: (ms: number) => (now += ms), now: () => now };
}

describe("QuotaLimiter", () => {
  it("stays 10% under each limit", () => {
    assert.deepEqual(limiter().l.limits, { rpm: 13, tpm: 225_000, rpd: 450 });
  });

  it("allows 13 requests a minute, then frees slots as the minute slides", () => {
    const { l, advance } = limiter();
    for (let i = 0; i < 13; i++) l.acquire(400);
    assert.throws(() => l.acquire(400), QuotaExceededError);
    advance(MINUTE);
    l.acquire(400);
  });

  it("counts tokens per minute, using real usage once settled", () => {
    const { l, advance } = limiter({ rpm: 100, tpm: 1_000, rpd: 500 });
    const slot = l.acquire(800);
    assert.throws(() => l.acquire(200), /token budget/);
    slot.settle(300);
    l.acquire(200);
    advance(MINUTE);
    l.acquire(800);
  });

  it("caps requests per day, including ones before a restart", () => {
    const { l, advance, now } = limiter({ rpm: 1_000, tpm: 10_000_000, rpd: 500 });
    l.seed([now() - DAY - 1, ...Array.from({ length: 449 }, (_, i) => now() - i * MINUTE)]);
    l.acquire(400);
    assert.throws(() => l.acquire(400), /daily budget/);
    advance(DAY - 448 * MINUTE);
    l.acquire(400);
  });

  it("pauses after the API reports 429", () => {
    const { l, advance } = limiter();
    l.backOff();
    assert.throws(() => l.acquire(400), /paused/);
    advance(MINUTE);
    l.acquire(400);
  });
});
