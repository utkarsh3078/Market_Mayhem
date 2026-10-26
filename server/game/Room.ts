import { randomUUID } from "node:crypto";
import { ASSETS, ASSET_SYMBOLS, type AssetSymbol } from "../../shared/assets";
import { S2C } from "../../shared/events";
import { MAX_PLAYERS_PER_ROOM, STARTING_CASH } from "../../shared/rules";
import type { TradeSubmitInput } from "../../shared/schemas";
import type {
  AssetQuote,
  AssetReveal,
  ErrorCode,
  GameError,
  GameResults,
  LeaderboardEntry,
  MarketSnapshot,
  NewsItem,
  PrivateClue,
  PrivatePlayerState,
  RoomState,
  RoomStatus,
  TradeRecord,
  TradeResultPayload,
} from "../../shared/types";
import {
  IMPACT_DECAY,
  applyShock,
  generatePricePath,
  quotePrice,
  tradeImpact,
  type PricePath,
} from "../engine/market";
import {
  calculatePortfolioValue,
  executeTrade,
  rankPlayers,
  toHoldings,
  type Account,
} from "../engine/portfolio";
import { publicScenarios, type ScenarioRegistry } from "../scenarios";
import type { ScenarioConfig } from "../scenarios/types";

export interface RoomTimings {
  startingMs: number;
  tickMs: number;
  resolvingMs: number;
}

export interface RoomEmitter {
  toRoom(code: string, event: string, payload: unknown): void;
  toPlayer(playerId: string, event: string, payload: unknown): void;
}

interface PlayerSlot {
  id: string;
  displayName: string;
  joinOrder: number;
  isReady: boolean;
  connected: boolean;
  account: Account;
  trades: TradeRecord[];
  clue: PrivateClue | null;
  requestIds: Set<string>;
}

const MESSAGES: Record<ErrorCode, string> = {
  INVALID_PAYLOAD: "That request was not valid.",
  NAME_REQUIRED: "Enter a display name first.",
  ROOM_NOT_FOUND: "No room with that code exists.",
  ROOM_FULL: "That room is full.",
  ROUND_IN_PROGRESS: "A round is already in progress in that room.",
  NOT_IN_ROOM: "You are not in this room.",
  NOT_HOST: "Only the host can do that.",
  ROUND_CLOSED: "Trading is closed right now.",
  STALE_ROUND: "That order was for a previous round.",
  INVALID_QUANTITY: "Quantity must be a whole number greater than zero.",
  UNKNOWN_ASSET: "That asset is not traded in this scenario.",
  INSUFFICIENT_CASH: "Not enough cash for that order (including fee).",
  INSUFFICIENT_HOLDINGS: "You can't sell more shares than you hold.",
  DUPLICATE_REQUEST: "That order was already submitted.",
  RATE_LIMITED: "Slow down a little and try again.",
  UNKNOWN_SCENARIO: "That scenario doesn't exist.",
};

const HOST_GRACE_MS = 15_000;

export function gameError(code: ErrorCode): GameError {
  return { code, message: MESSAGES[code] };
}

export class Room {
  status: RoomStatus = "LOBBY";
  hostPlayerId: string;
  roundId: string | null = null;
  lastActivity = Date.now();

  private players = new Map<string, PlayerSlot>();
  private joinCounter = 0;
  private path: PricePath | null = null;
  private tick = 0;
  private impact = this.zeroed();
  private history = this.emptyHistory();
  private finalPrices: Record<AssetSymbol, number> | null = null;
  private news: NewsItem[] = [];
  private phaseEndsAt: number | null = null;
  private results: GameResults | null = null;
  private timeout: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private hostTimer: NodeJS.Timeout | null = null;
  private scenario: ScenarioConfig;

  constructor(
    readonly code: string,
    hostId: string,
    hostName: string,
    private readonly registry: ScenarioRegistry,
    scenarioId: string,
    private readonly timings: RoomTimings,
    private readonly emitter: RoomEmitter,
  ) {
    const scenario = registry.get(scenarioId);
    if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
    this.scenario = scenario;
    this.hostPlayerId = hostId;
    this.addPlayer(hostId, hostName);
  }

  // ---------- membership ----------

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  get connectedCount(): number {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  /** Adds a new player (lobby only) or re-attaches an existing one. */
  addPlayer(playerId: string, displayName: string): GameError | null {
    const existing = this.players.get(playerId);
    if (existing) {
      existing.connected = true;
      if (this.status === "LOBBY") existing.displayName = displayName;
      this.touch();
      return null;
    }
    if (this.status !== "LOBBY") return gameError("ROUND_IN_PROGRESS");
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) return gameError("ROOM_FULL");
    this.players.set(playerId, {
      id: playerId,
      displayName,
      joinOrder: this.joinCounter++,
      isReady: false,
      connected: true,
      account: { cash: STARTING_CASH, positions: {} },
      trades: [],
      clue: null,
      requestIds: new Set(),
    });
    this.touch();
    return null;
  }

  /** Explicit leave. Lobby: removed. Mid-round: kept for scoring but marked offline. */
  removePlayer(playerId: string): void {
    if (!this.players.has(playerId)) return;
    if (this.status === "LOBBY" || this.status === "FINISHED") this.players.delete(playerId);
    else this.players.get(playerId)!.connected = false;
    this.reassignHostIfNeeded();
    this.touch();
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = connected;
    // Give a disconnected host a grace period (e.g. a page refresh) before handing over.
    if (!connected && playerId === this.hostPlayerId) {
      if (this.hostTimer) clearTimeout(this.hostTimer);
      this.hostTimer = setTimeout(() => {
        this.hostTimer = null;
        const before = this.hostPlayerId;
        this.reassignHostIfNeeded();
        if (before !== this.hostPlayerId) this.broadcastState();
      }, HOST_GRACE_MS);
    }
    this.touch();
  }

  setReady(playerId: string, ready: boolean): GameError | null {
    const player = this.players.get(playerId);
    if (!player) return gameError("NOT_IN_ROOM");
    if (this.status !== "LOBBY") return gameError("ROUND_IN_PROGRESS");
    player.isReady = ready;
    this.touch();
    return null;
  }

  private reassignHostIfNeeded(): void {
    const host = this.players.get(this.hostPlayerId);
    if (host?.connected) return;
    const next = [...this.players.values()]
      .filter((p) => p.connected)
      .sort((a, b) => a.joinOrder - b.joinOrder)[0];
    if (next) this.hostPlayerId = next.id;
  }

  get scenarioId(): string {
    return this.scenario.id;
  }

  /** Host-only, lobby-only. The choice is public; the scenario's hidden fields stay here. */
  selectScenario(requesterId: string, scenarioId: string): GameError | null {
    if (!this.players.has(requesterId)) return gameError("NOT_IN_ROOM");
    if (requesterId !== this.hostPlayerId) return gameError("NOT_HOST");
    if (this.status !== "LOBBY") return gameError("ROUND_IN_PROGRESS");
    const scenario = this.registry.get(scenarioId);
    if (!scenario) return gameError("UNKNOWN_SCENARIO");
    this.scenario = scenario;
    this.touch();
    return null;
  }

  // ---------- lifecycle: LOBBY → STARTING → ACTIVE → RESOLVING → FINISHED ----------

  start(requesterId: string, scenarioId?: string): GameError | null {
    if (!this.players.has(requesterId)) return gameError("NOT_IN_ROOM");
    if (requesterId !== this.hostPlayerId) return gameError("NOT_HOST");
    if (this.status !== "LOBBY") return gameError("ROUND_IN_PROGRESS");
    if (scenarioId !== undefined) {
      const error = this.selectScenario(requesterId, scenarioId);
      if (error) return error;
    }

    this.status = "STARTING";
    this.roundId = randomUUID();
    this.path = generatePricePath(this.scenario);
    this.tick = 0;
    this.impact = this.zeroed();
    this.history = this.emptyHistory();
    for (const symbol of ASSET_SYMBOLS) this.history[symbol].push(this.currentPrice(symbol));
    this.finalPrices = null;
    this.news = [];
    this.results = null;

    const ordered = [...this.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
    ordered.forEach((player, i) => {
      const clue = this.scenario.clues[i % this.scenario.clues.length];
      player.account = { cash: STARTING_CASH, positions: {} };
      player.trades = [];
      player.requestIds = new Set();
      player.clue = { ...clue };
    });

    this.phaseEndsAt = Date.now() + this.timings.startingMs;
    this.emitter.toRoom(this.code, S2C.GAME_STARTED, {
      roundId: this.roundId,
      status: this.status,
      phaseEndsAt: this.phaseEndsAt,
      serverNow: Date.now(),
      market: this.marketSnapshot(),
    });
    this.broadcastState();
    // Private clues go to each player's private channel only, never the room channel.
    for (const player of ordered) {
      this.emitter.toPlayer(player.id, S2C.CLUE_PRIVATE, player.clue);
      this.emitPlayerState(player.id);
    }
    this.timeout = setTimeout(() => this.openTrading(), this.timings.startingMs);
    this.touch();
    return null;
  }

  private openTrading(): void {
    this.status = "ACTIVE";
    this.phaseEndsAt = Date.now() + this.scenario.totalTicks * this.timings.tickMs;
    this.broadcastState();
    this.interval = setInterval(() => this.advanceTick(), this.timings.tickMs);
  }

  private advanceTick(): void {
    if (this.status !== "ACTIVE") return;
    this.tick += 1;
    for (const symbol of ASSET_SYMBOLS) {
      this.impact[symbol] *= IMPACT_DECAY;
      this.history[symbol][this.tick] = this.currentPrice(symbol);
    }
    for (const item of this.scenario.news.filter((n) => n.tick === this.tick)) {
      const published: NewsItem = { ...item, publishedAt: Date.now() };
      this.news.push(published);
      this.emitter.toRoom(this.code, S2C.NEWS_PUBLISH, published);
    }
    this.emitMarketUpdate();
    if (this.tick >= this.scenario.totalTicks) this.beginResolution();
  }

  private beginResolution(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.status = "RESOLVING";
    this.phaseEndsAt = Date.now() + this.timings.resolvingMs;
    this.broadcastState();
    this.timeout = setTimeout(() => this.finish(), this.timings.resolvingMs);
  }

  private finish(): void {
    const closing = this.currentPrices();
    const final = {} as Record<AssetSymbol, number>;
    for (const symbol of ASSET_SYMBOLS) {
      final[symbol] = applyShock(symbol, closing[symbol], this.scenario.resolution.shock[symbol] ?? 0);
      this.history[symbol].push(final[symbol]);
    }
    this.finalPrices = final;
    this.tick = this.history.NVE.length - 1;
    this.status = "FINISHED";
    this.phaseEndsAt = null;
    this.results = this.buildResults();

    this.emitter.toRoom(this.code, S2C.GAME_FINISHED, this.results);
    this.broadcastState();
    for (const id of this.players.keys()) this.emitPlayerState(id);
    this.touch();
  }

  reset(requesterId: string): GameError | null {
    if (!this.players.has(requesterId)) return gameError("NOT_IN_ROOM");
    if (requesterId !== this.hostPlayerId) return gameError("NOT_HOST");
    if (this.status !== "FINISHED") return gameError("ROUND_IN_PROGRESS");
    this.status = "LOBBY";
    this.roundId = null;
    this.path = null;
    this.finalPrices = null;
    this.results = null;
    this.news = [];
    this.history = this.emptyHistory();
    this.phaseEndsAt = null;
    for (const [id, player] of this.players) {
      if (!player.connected) {
        this.players.delete(id);
        continue;
      }
      player.isReady = false;
      player.account = { cash: STARTING_CASH, positions: {} };
      player.trades = [];
      player.clue = null;
      player.requestIds = new Set();
    }
    this.broadcastState();
    for (const id of this.players.keys()) this.emitPlayerState(id);
    this.touch();
    return null;
  }

  // ---------- trading ----------

  submitTrade(playerId: string, input: TradeSubmitInput): TradeResultPayload {
    const fail = (code: ErrorCode): TradeResultPayload => ({
      ok: false,
      requestId: input.requestId,
      error: gameError(code),
    });

    const player = this.players.get(playerId);
    if (!player) return fail("NOT_IN_ROOM");
    if (input.roundId !== this.roundId) return fail("STALE_ROUND");
    if (this.status !== "ACTIVE" || !this.phaseEndsAt || Date.now() >= this.phaseEndsAt) {
      return fail("ROUND_CLOSED");
    }
    if (!ASSET_SYMBOLS.includes(input.symbol)) return fail("UNKNOWN_ASSET");
    if (player.requestIds.has(input.requestId)) return fail("DUPLICATE_REQUEST");
    player.requestIds.add(input.requestId);

    // Execution price = midpoint of the quote before and after this order's impact (slippage).
    const symbol = input.symbol;
    const before = this.currentPrice(symbol);
    const impactAfter = this.impact[symbol] + tradeImpact(input.side, before * input.quantity);
    const after = quotePrice(symbol, this.path![symbol][this.tick], impactAfter);
    const price = Math.round((before + after) / 2);

    const outcome = executeTrade(player.account, input.side, symbol, input.quantity, price);
    if (!outcome.ok) return fail(outcome.code);

    player.account = outcome.account;
    this.impact[symbol] = impactAfter;
    this.history[symbol][this.tick] = after;
    const trade: TradeRecord = {
      id: randomUUID(),
      requestId: input.requestId,
      symbol,
      side: input.side,
      quantity: input.quantity,
      price,
      fee: outcome.fee,
      total: outcome.total,
      tick: this.tick,
      createdAt: Date.now(),
    };
    player.trades.unshift(trade);
    this.touch();

    this.emitMarketUpdate();
    const state = this.privateState(playerId);
    this.emitter.toPlayer(playerId, S2C.PLAYER_STATE, state);
    return { ok: true, requestId: input.requestId, trade, player: state };
  }

  // ---------- views ----------

  publicState(): RoomState {
    return {
      code: this.code,
      roundId: this.roundId,
      status: this.status,
      hostPlayerId: this.hostPlayerId,
      players: [...this.players.values()]
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((p) => ({
          id: p.id,
          displayName: p.displayName,
          isHost: p.id === this.hostPlayerId,
          isReady: p.isReady,
          connected: p.connected,
        })),
      scenario: {
        id: this.scenario.id,
        name: this.scenario.name,
        teaser: this.scenario.teaser,
        seed: this.scenario.seed,
      },
      scenarios: publicScenarios(this.registry),
      phaseEndsAt: this.phaseEndsAt,
      serverNow: Date.now(),
      startingCash: STARTING_CASH,
      market: this.path ? this.marketSnapshot() : null,
      news: [...this.news],
      leaderboard: this.path ? this.leaderboard() : [],
      results: this.results,
    };
  }

  privateState(playerId: string): PrivatePlayerState {
    const player = this.players.get(playerId)!;
    const value = calculatePortfolioValue(player.account, this.currentPrices());
    return {
      playerId,
      roundId: this.roundId,
      cash: player.account.cash,
      holdings: toHoldings(player.account),
      trades: player.trades.slice(0, 50),
      clue: this.status === "LOBBY" ? null : player.clue,
      portfolioValue: value,
      pnl: value - STARTING_CASH,
    };
  }

  emitPlayerState(playerId: string): void {
    if (!this.players.has(playerId)) return;
    this.emitter.toPlayer(playerId, S2C.PLAYER_STATE, this.privateState(playerId));
  }

  broadcastState(): void {
    this.emitter.toRoom(this.code, S2C.ROOM_STATE, this.publicState());
  }

  dispose(): void {
    if (this.timeout) clearTimeout(this.timeout);
    if (this.interval) clearInterval(this.interval);
    if (this.hostTimer) clearTimeout(this.hostTimer);
  }

  // ---------- internals ----------

  private touch(): void {
    this.lastActivity = Date.now();
  }

  private zeroed(): Record<AssetSymbol, number> {
    return Object.fromEntries(ASSET_SYMBOLS.map((s) => [s, 0])) as Record<AssetSymbol, number>;
  }

  private emptyHistory(): Record<AssetSymbol, number[]> {
    return Object.fromEntries(ASSET_SYMBOLS.map((s) => [s, []])) as unknown as Record<AssetSymbol, number[]>;
  }

  private currentPrice(symbol: AssetSymbol): number {
    if (this.finalPrices) return this.finalPrices[symbol];
    if (!this.path) return ASSETS.find((a) => a.symbol === symbol)!.initialPrice;
    return quotePrice(symbol, this.path[symbol][this.tick], this.impact[symbol]);
  }

  private currentPrices(): Record<AssetSymbol, number> {
    return Object.fromEntries(ASSET_SYMBOLS.map((s) => [s, this.currentPrice(s)])) as Record<AssetSymbol, number>;
  }

  private quotes(): AssetQuote[] {
    return ASSETS.map((asset) => {
      const price = this.currentPrice(asset.symbol);
      const open = this.history[asset.symbol][0] ?? asset.initialPrice;
      return {
        symbol: asset.symbol,
        price,
        change: price - open,
        changePct: Math.round(((price - open) / open) * 10_000) / 100,
      };
    });
  }

  private marketSnapshot(): MarketSnapshot {
    return {
      tick: this.tick,
      totalTicks: this.scenario.totalTicks,
      quotes: this.quotes(),
      history: Object.fromEntries(
        ASSET_SYMBOLS.map((s) => [s, [...this.history[s]]]),
      ) as Record<AssetSymbol, number[]>,
    };
  }

  private leaderboard(): LeaderboardEntry[] {
    const prices = this.currentPrices();
    return rankPlayers(
      [...this.players.values()].map((p) => ({
        playerId: p.id,
        displayName: p.displayName,
        portfolioValue: calculatePortfolioValue(p.account, prices),
        joinOrder: p.joinOrder,
      })),
      STARTING_CASH,
    );
  }

  private emitMarketUpdate(): void {
    this.emitter.toRoom(this.code, S2C.MARKET_UPDATE, {
      roundId: this.roundId,
      tick: this.tick,
      quotes: this.quotes(),
      leaderboard: this.leaderboard(),
    });
  }

  private buildResults(): GameResults {
    const { resolution } = this.scenario;
    const assets: AssetReveal[] = ASSETS.map((asset) => {
      const series = this.history[asset.symbol];
      const open = series[0];
      const final = series[series.length - 1];
      return {
        symbol: asset.symbol,
        openPrice: open,
        peakPrice: Math.max(...series),
        troughPrice: Math.min(...series),
        finalPrice: final,
        changePct: Math.round(((final - open) / open) * 10_000) / 100,
        explanation: resolution.explanations[asset.symbol],
      };
    });
    return {
      roundId: this.roundId!,
      leaderboard: this.leaderboard().map((entry) => {
        const player = this.players.get(entry.playerId)!;
        return {
          ...entry,
          tradeCount: player.trades.length,
          clueTitle: player.clue?.title ?? null,
          clueContent: player.clue?.content ?? null,
          clueConfidence: player.clue?.confidence ?? null,
        };
      }),
      reveal: {
        headline: resolution.headline,
        summary: resolution.summary,
        assets,
        lessons: resolution.lessons,
      },
    };
  }
}
