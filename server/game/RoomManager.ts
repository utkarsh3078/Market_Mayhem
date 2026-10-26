import { randomInt } from "node:crypto";
import { ROOM_CODE_LENGTH } from "../../shared/rules";
import type { ScenarioRegistry } from "../scenarios";
import { Room, type RoomEmitter, type RoomTimings } from "./Room";

// No 0/O/1/I to keep codes easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const IDLE_ROOM_TTL_MS = 15 * 60 * 1000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout;

  constructor(
    private readonly registry: ScenarioRegistry,
    private readonly defaultScenarioId: string,
    private readonly timings: RoomTimings,
    private readonly emitter: RoomEmitter,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  create(hostId: string, hostName: string): Room {
    let code: string;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    const room = new Room(
      code,
      hostId,
      hostName,
      this.registry,
      this.defaultScenarioId,
      this.timings,
      this.emitter,
    );
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Remove rooms nobody is connected to after a period of inactivity. */
  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.connectedCount === 0 && now - room.lastActivity > IDLE_ROOM_TTL_MS) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  close(): void {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
