// Game rules shared by server (enforcement) and client (display/estimates).

export const STARTING_CASH = 10_000_000; // 100,000 credits in cents
export const MAX_ORDER_QUANTITY = 10_000;
export const MAX_PLAYERS_PER_ROOM = 8;
export const FEE_BPS = 10; // 0.10% fee on every trade
export const MAX_DISPLAY_NAME = 20;
export const ROOM_CODE_LENGTH = 5;

/** Fee in cents for a given notional (cents). */
export function tradeFee(notional: number): number {
  return Math.round((notional * FEE_BPS) / 10_000);
}
