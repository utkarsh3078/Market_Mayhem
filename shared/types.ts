import type { AssetSymbol } from "./assets";

export type RoomStatus = "LOBBY" | "STARTING" | "ACTIVE" | "RESOLVING" | "FINISHED";
export type TradeSide = "BUY" | "SELL";

export type ErrorCode =
  | "INVALID_PAYLOAD"
  | "NAME_REQUIRED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROUND_IN_PROGRESS"
  | "NOT_IN_ROOM"
  | "NOT_HOST"
  | "ROUND_CLOSED"
  | "STALE_ROUND"
  | "INVALID_QUANTITY"
  | "UNKNOWN_ASSET"
  | "INSUFFICIENT_CASH"
  | "INSUFFICIENT_HOLDINGS"
  | "DUPLICATE_REQUEST"
  | "RATE_LIMITED";

export interface GameError {
  code: ErrorCode;
  message: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: GameError };

export interface Session {
  playerId: string;
  token: string; // secret; only ever sent to its owner
}

export interface PublicPlayer {
  id: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
}

export interface AssetQuote {
  symbol: AssetSymbol;
  price: number; // cents
  change: number; // cents vs. round open
  changePct: number;
}

export interface MarketSnapshot {
  tick: number;
  totalTicks: number;
  quotes: AssetQuote[];
  /** Price (cents) per tick, index = tick. */
  history: Record<AssetSymbol, number[]>;
}

export interface NewsItem {
  id: string;
  tick: number;
  headline: string;
  body: string;
  category: string;
  publishedAt: number;
}

export type ClueConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface PrivateClue {
  id: string;
  title: string;
  content: string;
  confidence: ClueConfidence;
  hint: string;
}

export interface Holding {
  symbol: AssetSymbol;
  quantity: number;
  averageCost: number; // cents per share
}

export interface TradeRecord {
  id: string;
  requestId: string;
  symbol: AssetSymbol;
  side: TradeSide;
  quantity: number;
  price: number; // execution price, cents
  fee: number; // cents
  total: number; // cash moved, cents (cost for buys, proceeds for sells)
  tick: number;
  createdAt: number;
}

export interface PrivatePlayerState {
  playerId: string;
  roundId: string | null;
  cash: number;
  holdings: Holding[];
  trades: TradeRecord[];
  clue: PrivateClue | null;
  portfolioValue: number;
  pnl: number;
}

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  portfolioValue: number;
  pnl: number;
  returnPct: number;
  rank: number;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  teaser: string;
  seed: string;
}

export interface RoomState {
  code: string;
  roundId: string | null;
  status: RoomStatus;
  hostPlayerId: string;
  players: PublicPlayer[];
  scenario: ScenarioSummary;
  /** Server epoch ms when the current timed phase ends. */
  phaseEndsAt: number | null;
  serverNow: number;
  startingCash: number;
  market: MarketSnapshot | null;
  news: NewsItem[];
  leaderboard: LeaderboardEntry[];
  results: GameResults | null;
}

export interface AssetReveal {
  symbol: AssetSymbol;
  openPrice: number;
  peakPrice: number;
  troughPrice: number;
  finalPrice: number;
  changePct: number;
  explanation: string;
}

export interface ResultEntry extends LeaderboardEntry {
  tradeCount: number;
  clueTitle: string | null;
  clueContent: string | null;
  clueConfidence: ClueConfidence | null;
}

export interface GameResults {
  roundId: string;
  leaderboard: ResultEntry[];
  reveal: {
    headline: string;
    summary: string;
    assets: AssetReveal[];
    lessons: string[];
  };
}

// ---- Event payloads ----

export interface GameStartedPayload {
  roundId: string;
  status: RoomStatus;
  phaseEndsAt: number;
  serverNow: number;
  market: MarketSnapshot;
}

export interface MarketUpdatePayload {
  roundId: string;
  tick: number;
  quotes: AssetQuote[];
  leaderboard: LeaderboardEntry[];
}

export type TradeResultPayload =
  | { ok: true; requestId: string; trade: TradeRecord; player: PrivatePlayerState }
  | { ok: false; requestId: string; error: GameError };
