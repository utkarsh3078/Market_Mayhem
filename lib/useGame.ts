"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { AssetSymbol } from "@/shared/assets";
import { C2S, S2C } from "@/shared/events";
import type {
  Ack,
  GameError,
  GameResults,
  GameStartedPayload,
  MarketUpdatePayload,
  NewsItem,
  PrivateClue,
  PrivatePlayerState,
  RoomState,
  Session,
  TradeResultPayload,
  TradeSide,
} from "@/shared/types";

const TOKEN_KEY = "mm.token"; // sessionStorage: one player per tab, survives refresh

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface Toast {
  id: string;
  tone: "info" | "up" | "down" | "warn" | "intel";
  title: string;
  body?: string;
}

export interface GameState {
  connection: ConnectionStatus;
  session: Session | null;
  room: RoomState | null;
  me: PrivatePlayerState | null;
  clue: PrivateClue | null;
  pendingTrades: string[];
  toasts: Toast[];
  /** serverTime ≈ Date.now() + serverOffset */
  serverOffset: number;
  freshNewsId: string | null;
}

type Action =
  | { type: "connection"; status: ConnectionStatus }
  | { type: "session"; session: Session }
  | { type: "roomState"; room: RoomState | null; offset: number }
  | { type: "playerState"; me: PrivatePlayerState }
  | { type: "gameStarted"; payload: GameStartedPayload; offset: number }
  | { type: "marketUpdate"; payload: MarketUpdatePayload }
  | { type: "news"; item: NewsItem }
  | { type: "clue"; clue: PrivateClue }
  | { type: "finished"; results: GameResults }
  | { type: "tradePending"; requestId: string }
  | { type: "tradeResult"; result: TradeResultPayload }
  | { type: "toast"; toast: Toast }
  | { type: "dismiss"; id: string }
  | { type: "left" };

const initialState: GameState = {
  connection: "connecting",
  session: null,
  room: null,
  me: null,
  clue: null,
  pendingTrades: [],
  toasts: [],
  serverOffset: 0,
  freshNewsId: null,
};

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "connection":
      return { ...state, connection: action.status };
    case "session":
      return { ...state, session: action.session };
    case "roomState": {
      if (!action.room) return { ...state, room: null, me: null, clue: null };
      const clue = action.room.status === "LOBBY" ? null : state.clue;
      return { ...state, room: action.room, clue, serverOffset: action.offset };
    }
    case "playerState":
      return { ...state, me: action.me, clue: action.me.clue ?? state.clue };
    case "gameStarted": {
      if (!state.room) return state;
      const { payload } = action;
      return {
        ...state,
        serverOffset: action.offset,
        room: {
          ...state.room,
          roundId: payload.roundId,
          status: payload.status,
          phaseEndsAt: payload.phaseEndsAt,
          market: payload.market,
          news: [],
          leaderboard: [],
          results: null,
        },
      };
    }
    case "marketUpdate": {
      const room = state.room;
      if (!room?.market || room.roundId !== action.payload.roundId) return state;
      const history = { ...room.market.history };
      for (const quote of action.payload.quotes) {
        const series = [...history[quote.symbol]];
        series[action.payload.tick] = quote.price;
        history[quote.symbol] = series;
      }
      return {
        ...state,
        room: {
          ...room,
          market: {
            ...room.market,
            tick: Math.max(room.market.tick, action.payload.tick),
            quotes: action.payload.quotes,
            history,
          },
          leaderboard: action.payload.leaderboard,
        },
      };
    }
    case "news": {
      if (!state.room || state.room.news.some((n) => n.id === action.item.id)) return state;
      return {
        ...state,
        freshNewsId: action.item.id,
        room: { ...state.room, news: [...state.room.news, action.item] },
      };
    }
    case "clue":
      return { ...state, clue: action.clue };
    case "finished":
      return state.room ? { ...state, room: { ...state.room, results: action.results } } : state;
    case "tradePending":
      return { ...state, pendingTrades: [...state.pendingTrades, action.requestId] };
    case "tradeResult": {
      const pendingTrades = state.pendingTrades.filter((id) => id !== action.result.requestId);
      return action.result.ok
        ? { ...state, pendingTrades, me: action.result.player }
        : { ...state, pendingTrades };
    }
    case "toast":
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] };
    case "dismiss":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "left":
      return { ...state, room: null, me: null, clue: null };
  }
}

function serverUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

function readToken(): string | undefined {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode: identity just won't survive a refresh.
  }
}

let toastSeq = 0;

export function useGame() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<Socket | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = `t${++toastSeq}`;
    dispatch({ type: "toast", toast: { ...t, id } });
    setTimeout(() => dispatch({ type: "dismiss", id }), 4500);
  }, []);

  useEffect(() => {
    const socket = io(serverUrl(), { auth: { token: readToken() }, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const offsetFrom = (serverNow: number) => serverNow - Date.now();

    socket.on("connect", () => dispatch({ type: "connection", status: "connected" }));
    socket.on("disconnect", () => dispatch({ type: "connection", status: "disconnected" }));
    socket.on("connect_error", () => dispatch({ type: "connection", status: "disconnected" }));
    socket.io.on("reconnect", () => socket.emit(C2S.GAME_REQUEST_STATE));

    socket.on(S2C.SESSION, (session: Session) => {
      saveToken(session.token);
      // Keep the same identity across automatic reconnects.
      socket.auth = { token: session.token };
      dispatch({ type: "session", session });
    });
    socket.on(S2C.ROOM_STATE, (room: RoomState | null) =>
      dispatch({ type: "roomState", room, offset: room ? offsetFrom(room.serverNow) : 0 }),
    );
    socket.on(S2C.PLAYER_STATE, (me: PrivatePlayerState) => dispatch({ type: "playerState", me }));
    socket.on(S2C.GAME_STARTED, (payload: GameStartedPayload) =>
      dispatch({ type: "gameStarted", payload, offset: offsetFrom(payload.serverNow) }),
    );
    socket.on(S2C.MARKET_UPDATE, (payload: MarketUpdatePayload) => dispatch({ type: "marketUpdate", payload }));
    socket.on(S2C.NEWS_PUBLISH, (item: NewsItem) => {
      dispatch({ type: "news", item });
      toast({ tone: "warn", title: `Breaking · ${item.category}`, body: item.headline });
    });
    socket.on(S2C.CLUE_PRIVATE, (clue: PrivateClue) => {
      dispatch({ type: "clue", clue });
      toast({ tone: "intel", title: "Private clue received", body: "Only you can see it. Look for the orange card." });
    });
    socket.on(S2C.GAME_FINISHED, (results: GameResults) => dispatch({ type: "finished", results }));
    socket.on(S2C.TRADE_RESULT, (result: TradeResultPayload) => {
      dispatch({ type: "tradeResult", result });
      if (result.ok) {
        const t = result.trade;
        toast({
          tone: t.side === "BUY" ? "up" : "down",
          title: `${t.side === "BUY" ? "Bought" : "Sold"} ${t.quantity} ${t.symbol}`,
          body: `at ${(t.price / 100).toFixed(2)} · fee ${(t.fee / 100).toFixed(2)}`,
        });
      } else {
        toast({ tone: "down", title: "Order rejected", body: result.error.message });
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [toast]);

  const call = useCallback(<T,>(event: string, payload: unknown = {}): Promise<Ack<T>> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      const error: GameError = { code: "INVALID_PAYLOAD", message: "Not connected to the game server." };
      return Promise.resolve({ ok: false, error });
    }
    return new Promise((resolve) => {
      socket.timeout(8000).emit(event, payload, (err: Error | null, res: Ack<T>) => {
        resolve(err ? { ok: false, error: { code: "INVALID_PAYLOAD", message: "Server did not respond." } } : res);
      });
    });
  }, []);

  const actions = {
    createRoom: (displayName: string) => call<RoomState>(C2S.ROOM_CREATE, { displayName }),
    joinRoom: (roomCode: string, displayName: string) => call<RoomState>(C2S.ROOM_JOIN, { roomCode, displayName }),
    leaveRoom: async () => {
      await call(C2S.ROOM_LEAVE);
      dispatch({ type: "left" });
    },
    setReady: (ready: boolean) => call(C2S.PLAYER_READY, { ready }),
    selectScenario: (scenarioId: string, theme?: string) => call(C2S.ROOM_SCENARIO, { scenarioId, theme }),
    startGame: () => call(C2S.GAME_START),
    resetGame: () => call(C2S.GAME_RESET),
    submitTrade: (symbol: AssetSymbol, side: TradeSide, quantity: number) => {
      const socket = socketRef.current;
      const roundId = state.room?.roundId;
      if (!socket || !roundId) return;
      const requestId = crypto.randomUUID();
      dispatch({ type: "tradePending", requestId });
      // Only intent is sent. The server decides price, cost and validity.
      socket.emit(C2S.TRADE_SUBMIT, { roundId, requestId, symbol, side, quantity });
    },
    toast,
    dismissToast: (id: string) => dispatch({ type: "dismiss", id }),
  };

  return { state, actions };
}

export type GameActions = ReturnType<typeof useGame>["actions"];