import type { GameResults, TradeRecord } from "../../shared/types";

export interface RoundStartRecord {
  roundId: string;
  code: string;
  scenarioId: string;
  scenarioVersion: number;
  seed: string;
  players: { id: string; displayName: string; joinOrder: number; clueId: string | null }[];
}

/**
 * Write side is fire-and-forget: each method only enqueues work and returns immediately, so a slow or
 * broken database can never stall a round. Implementations must log failures, never throw.
 */
export interface Persistence {
  roundStarted(record: RoundStartRecord): void;
  tradeExecuted(roundId: string, playerId: string, trade: TradeRecord): void;
  roundFinished(roundId: string, results: GameResults): void;
  /** Latest finished round's results for a room code, or null. Used once a room has left memory. */
  findResults(code: string): Promise<GameResults | null>;
  /** When rounds finished since `since` (ms timestamps), or [] on failure. Restores the AI quota's daily count after a restart. */
  roundsFinishedSince(since: Date): Promise<number[]>;
  /** Flush queued writes (bounded by timeoutMs) and release connections. */
  close(timeoutMs?: number): Promise<void>;
}

/** Used when DATABASE_URL is not set: the game runs purely in memory. */
export const noopPersistence: Persistence = {
  roundStarted: () => {},
  tradeExecuted: () => {},
  roundFinished: () => {},
  findResults: async () => null,
  roundsFinishedSince: async () => [],
  close: async () => {},
};
