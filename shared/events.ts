// Single source of truth for Socket.IO event names.

export const C2S = {
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  PLAYER_READY: "player:ready",
  ROOM_SCENARIO: "room:scenario",
  ROOM_NEWSROOM: "room:newsroom",
  GAME_START: "game:start",
  GAME_RESET: "game:reset",
  TRADE_SUBMIT: "trade:submit",
  GAME_REQUEST_STATE: "game:requestState",
} as const;

export const S2C = {
  SESSION: "session",
  ROOM_STATE: "room:state",
  PLAYER_STATE: "player:state",
  GAME_STARTED: "game:started",
  NEWS_PUBLISH: "news:publish",
  NEWSROOM_SEGMENT: "newsroom:segment",
  CLUE_PRIVATE: "clue:private",
  MARKET_UPDATE: "market:update",
  TRADE_RESULT: "trade:result",
  GAME_FINISHED: "game:finished",
  ERROR: "game:error",
} as const;
