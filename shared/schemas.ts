import { z } from "zod";
import { ASSET_SYMBOLS } from "./assets";
import { MAX_DISPLAY_NAME, MAX_ORDER_QUANTITY, ROOM_CODE_LENGTH } from "./rules";

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a display name")
  .max(MAX_DISPLAY_NAME, `Name must be ${MAX_DISPLAY_NAME} characters or fewer`);

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`), "Room codes are 5 letters/numbers");

export const roomCreateSchema = z.object({ displayName: displayNameSchema });

export const roomJoinSchema = z.object({
  roomCode: roomCodeSchema,
  displayName: displayNameSchema,
});

export const playerReadySchema = z.object({ ready: z.boolean() });

export const tradeSubmitSchema = z.object({
  roundId: z.string().min(1).max(64),
  requestId: z.string().min(8).max(64),
  symbol: z.enum(ASSET_SYMBOLS),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive().max(MAX_ORDER_QUANTITY),
});

export type RoomCreateInput = z.infer<typeof roomCreateSchema>;
export type RoomJoinInput = z.infer<typeof roomJoinSchema>;
export type TradeSubmitInput = z.infer<typeof tradeSubmitSchema>;
