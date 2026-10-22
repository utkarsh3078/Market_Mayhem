"use client";

import { useEffect, useState } from "react";

/** Seconds remaining until a server-time deadline, using the measured server clock offset. */
export function useCountdown(endsAt: number | null, serverOffset: number): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (!endsAt || now === null) return null;
  return Math.max(0, Math.ceil((endsAt - (now + serverOffset)) / 1000));
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
