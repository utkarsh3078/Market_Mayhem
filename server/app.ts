import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import type { z } from "zod";
import { ASSETS } from "../shared/assets";
import { C2S, S2C } from "../shared/events";
import {
  gameStartSchema,
  playerReadySchema,
  roomCodeSchema,
  roomCreateSchema,
  roomJoinSchema,
  scenarioSelectSchema,
  tradeSubmitSchema,
} from "../shared/schemas";
import type { Ack, ErrorCode, GameError, RoomState, Session } from "../shared/types";
import { gameError, type Room, type RoomEmitter, type RoomTimings } from "./game/Room";
import { RoomManager } from "./game/RoomManager";
import { createRegistry, DEFAULT_SCENARIO_ID, SCENARIOS } from "./scenarios";
import type { ScenarioConfig } from "./scenarios/types";

export interface GameServerOptions {
  /** Allowed browser origins; undefined allows any origin (development). */
  clientOrigins?: string[];
  timings: RoomTimings;
  /** Scenarios rooms can choose from; defaults to the registry in server/scenarios/index.ts. */
  scenarios?: ScenarioConfig[];
  /** Scenario a new room starts with; defaults to the first of `scenarios`, or energy-shock. */
  defaultScenarioId?: string;
  log?: (message: string) => void;
}

interface SessionRecord {
  playerId: string;
  token: string;
  roomCode: string | null;
  sockets: number;
}

interface SocketData {
  session: SessionRecord;
  hits: Map<string, number[]>;
}

type GameSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

const playerChannel = (id: string) => `player:${id}`;
const roomChannel = (code: string) => `room:${code}`;

export function createGameServer(options: GameServerOptions): {
  httpServer: HttpServer;
  io: Server;
  close: () => Promise<void>;
} {
  const log = options.log ?? (() => {});
  const corsOrigin = options.clientOrigins?.length ? options.clientOrigins : true;

  const app = express();
  app.use(cors({ origin: corsOrigin }));
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: corsOrigin } });

  const emitter: RoomEmitter = {
    toRoom: (code, event, payload) => io.to(roomChannel(code)).emit(event, payload),
    toPlayer: (playerId, event, payload) => io.to(playerChannel(playerId)).emit(event, payload),
  };
  const registry = options.scenarios ? createRegistry(options.scenarios) : SCENARIOS;
  const defaultScenarioId =
    options.defaultScenarioId ?? (options.scenarios ? options.scenarios[0].id : DEFAULT_SCENARIO_ID);
  if (!registry.has(defaultScenarioId)) throw new Error(`Unknown default scenario: ${defaultScenarioId}`);
  const rooms = new RoomManager(registry, defaultScenarioId, options.timings, emitter);
  const sessions = new Map<string, SessionRecord>();

  // ---------- HTTP ----------

  app.get("/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get("/api/assets", (_req, res) => {
    res.json({ assets: ASSETS });
  });

  app.get("/api/rooms/:code", (req, res) => {
    const code = roomCodeSchema.safeParse(req.params.code);
    const room = code.success ? rooms.get(code.data) : undefined;
    if (!room) return res.status(404).json({ error: gameError("ROOM_NOT_FOUND") });
    res.json({ room: room.publicState() });
  });

  app.get("/api/rooms/:code/results", (req, res) => {
    const code = roomCodeSchema.safeParse(req.params.code);
    const room = code.success ? rooms.get(code.data) : undefined;
    if (!room) return res.status(404).json({ error: gameError("ROOM_NOT_FOUND") });
    const { results } = room.publicState();
    if (!results) return res.status(409).json({ error: gameError("ROUND_IN_PROGRESS") });
    res.json({ results });
  });

  // ---------- Socket.IO ----------

  // Guest identity: reuse the session for a known token, otherwise mint a new player.
  io.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
    let session = sessions.get(token);
    if (!session) {
      session = { playerId: randomUUID(), token: randomUUID(), roomCode: null, sockets: 0 };
      sessions.set(session.token, session);
    }
    socket.data.session = session;
    socket.data.hits = new Map();
    next();
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as unknown as GameSocket;
    const session = socket.data.session;
    session.sockets += 1;
    socket.join(playerChannel(session.playerId));
    socket.emit(S2C.SESSION, { playerId: session.playerId, token: session.token } satisfies Session);

    // Reconnect: restore room membership and state.
    const existing = session.roomCode ? rooms.get(session.roomCode) : undefined;
    if (existing?.hasPlayer(session.playerId)) {
      socket.join(roomChannel(existing.code));
      existing.setConnected(session.playerId, true);
      existing.broadcastState();
      existing.emitPlayerState(session.playerId);
    } else {
      session.roomCode = null;
    }

    const rateLimited = (key: string, max: number, windowMs: number): boolean => {
      const now = Date.now();
      const hits = (socket.data.hits.get(key) ?? []).filter((t) => now - t < windowMs);
      hits.push(now);
      socket.data.hits.set(key, hits);
      return hits.length > max;
    };

    const currentRoom = (): Room | undefined => {
      const room = session.roomCode ? rooms.get(session.roomCode) : undefined;
      return room?.hasPlayer(session.playerId) ? room : undefined;
    };

    const reply = <T>(ack: unknown, result: Ack<T>) => {
      if (typeof ack === "function") ack(result);
    };
    const fail = (ack: unknown, error: GameError | ErrorCode) => {
      const err = typeof error === "string" ? gameError(error) : error;
      reply(ack, { ok: false, error: err });
    };
    const parse = <S extends z.ZodType>(schema: S, payload: unknown, ack: unknown): z.infer<S> | null => {
      const result = schema.safeParse(payload ?? {});
      if (result.success) return result.data;
      fail(ack, { code: "INVALID_PAYLOAD", message: result.error.issues[0]?.message ?? "Invalid request" });
      return null;
    };

    const enterRoom = (room: Room) => {
      const previous = currentRoom();
      if (previous && previous.code !== room.code) leaveRoom(previous);
      session.roomCode = room.code;
      io.in(playerChannel(session.playerId)).socketsJoin(roomChannel(room.code));
      room.broadcastState();
      room.emitPlayerState(session.playerId);
    };

    const leaveRoom = (room: Room) => {
      room.removePlayer(session.playerId);
      io.in(playerChannel(session.playerId)).socketsLeave(roomChannel(room.code));
      session.roomCode = null;
      room.broadcastState();
    };

    socket.on(C2S.ROOM_CREATE, (payload: unknown, ack: unknown) => {
      if (rateLimited("room", 10, 60_000)) return fail(ack, "RATE_LIMITED");
      const input = parse(roomCreateSchema, payload, ack);
      if (!input) return;
      const room = rooms.create(session.playerId, input.displayName);
      enterRoom(room);
      log(`room ${room.code} created by ${input.displayName}`);
      reply<RoomState>(ack, { ok: true, data: room.publicState() });
    });

    socket.on(C2S.ROOM_JOIN, (payload: unknown, ack: unknown) => {
      if (rateLimited("room", 10, 60_000)) return fail(ack, "RATE_LIMITED");
      const input = parse(roomJoinSchema, payload, ack);
      if (!input) return;
      const room = rooms.get(input.roomCode);
      if (!room) return fail(ack, "ROOM_NOT_FOUND");
      const error = room.addPlayer(session.playerId, input.displayName);
      if (error) return fail(ack, error);
      enterRoom(room);
      reply<RoomState>(ack, { ok: true, data: room.publicState() });
    });

    socket.on(C2S.ROOM_LEAVE, (_payload: unknown, ack: unknown) => {
      const room = currentRoom();
      if (room) leaveRoom(room);
      reply(ack, { ok: true, data: null });
    });

    socket.on(C2S.PLAYER_READY, (payload: unknown, ack: unknown) => {
      const input = parse(playerReadySchema, payload, ack);
      if (!input) return;
      const room = currentRoom();
      if (!room) return fail(ack, "NOT_IN_ROOM");
      const error = room.setReady(session.playerId, input.ready);
      if (error) return fail(ack, error);
      room.broadcastState();
      reply(ack, { ok: true, data: null });
    });

    socket.on(C2S.ROOM_SCENARIO, (payload: unknown, ack: unknown) => {
      const input = parse(scenarioSelectSchema, payload, ack);
      if (!input) return;
      const room = currentRoom();
      if (!room) return fail(ack, "NOT_IN_ROOM");
      const error = room.selectScenario(session.playerId, input.scenarioId);
      if (error) return fail(ack, error);
      room.broadcastState();
      reply(ack, { ok: true, data: null });
    });

    socket.on(C2S.GAME_START, (payload: unknown, ack: unknown) => {
      const input = parse(gameStartSchema, payload, ack);
      if (!input) return;
      const room = currentRoom();
      if (!room) return fail(ack, "NOT_IN_ROOM");
      const error = room.start(session.playerId, input.scenarioId);
      if (error) return fail(ack, error);
      log(`room ${room.code} started round ${room.roundId} (${room.scenarioId})`);
      reply(ack, { ok: true, data: null });
    });

    socket.on(C2S.GAME_RESET, (_payload: unknown, ack: unknown) => {
      const room = currentRoom();
      if (!room) return fail(ack, "NOT_IN_ROOM");
      const error = room.reset(session.playerId);
      if (error) return fail(ack, error);
      reply(ack, { ok: true, data: null });
    });

    socket.on(C2S.TRADE_SUBMIT, (payload: unknown) => {
      const requestId =
        typeof (payload as { requestId?: unknown })?.requestId === "string"
          ? (payload as { requestId: string }).requestId
          : "unknown";
      const reject = (error: GameError) => {
        socket.emit(S2C.TRADE_RESULT, { ok: false, requestId, error });
      };

      if (rateLimited("trade", 10, 1_000)) return reject(gameError("RATE_LIMITED"));
      const parsed = tradeSubmitSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const code: ErrorCode = issue?.path[0] === "quantity" ? "INVALID_QUANTITY" : "INVALID_PAYLOAD";
        log(`trade rejected (${code}) for ${session.playerId}`);
        return reject(gameError(code));
      }
      const room = currentRoom();
      if (!room) return reject(gameError("NOT_IN_ROOM"));
      const result = room.submitTrade(session.playerId, parsed.data);
      if (!result.ok) log(`trade rejected (${result.error.code}) in ${room.code}`);
      socket.emit(S2C.TRADE_RESULT, result);
    });

    socket.on(C2S.GAME_REQUEST_STATE, () => {
      const room = currentRoom();
      if (!room) {
        socket.emit(S2C.ROOM_STATE, null);
        return;
      }
      socket.emit(S2C.ROOM_STATE, room.publicState());
      room.emitPlayerState(session.playerId);
    });

    socket.on("disconnect", () => {
      session.sockets -= 1;
      if (session.sockets > 0) return;
      const room = currentRoom();
      if (room) {
        room.setConnected(session.playerId, false);
        room.broadcastState();
      }
    });
  });

  return {
    httpServer,
    io,
    close: async () => {
      rooms.close();
      await io.close();
    },
  };
}
