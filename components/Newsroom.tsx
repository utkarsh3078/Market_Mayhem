"use client";

import { useEffect, useRef, useState } from "react";
import type { NewsroomSegment } from "@/shared/newsroom";
import type { AssetQuote, RoomState } from "@/shared/types";
import { arrow, formatCredits, formatPct } from "@/lib/format";
import { formatClock, useCountdown } from "@/lib/useCountdown";
import { speechSupported, useSpeech } from "@/lib/useSpeech";
import { Anchor, NewsDesk, StandbyArt, StoryArt, StudioBackdrop, type MouthState } from "./NewsroomArt";

// Full-screen Live Newsroom. Stories exist only here: nothing is replayed, and a story that ended
// before you opened the screen (or arrived late) is skipped. Captions follow the server clock; the
// voice follows the captions, so timing never depends on audio. No trading from in here, on purpose.

const LINE_PAUSE_MS = 350;
/** Don't start speaking a line that began longer ago than this; its caption still shows. */
const LATE_SPEECH_MS = 1200;

interface Voice {
  /** `${segmentId}#${line}` of the utterance in progress. */
  key: string | null;
  speaking: boolean;
  /** The voice reports word boundaries, so the mouth and captions can follow it exactly. */
  boundary: boolean;
  charIndex: number;
  mouthOpen: boolean;
}

const silent: Voice = { key: null, speaking: false, boundary: false, charIndex: 0, mouthOpen: false };

export function LiveBadge({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.18em] ${
        on ? "bg-down text-white" : "bg-white/15 text-white/70"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-white ${on ? "mm-live" : "opacity-50"}`} aria-hidden="true" />
      LIVE
    </span>
  );
}

export function Newsroom({
  room,
  segment,
  serverOffset,
  onClose,
}: {
  room: RoomState;
  segment: NewsroomSegment | null;
  serverOffset: number;
  onClose: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState<Voice>(silent);
  const [canSpeak] = useState(speechSupported);
  const { speak, cancel } = useSpeech();
  const closeRef = useRef<HTMLButtonElement>(null);
  const offsetRef = useRef(serverOffset);
  const remaining = useCountdown(room.phaseEndsAt, serverOffset);

  useEffect(() => {
    offsetRef.current = serverOffset;
  }, [serverOffset]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  // Esc closes; the page behind doesn't scroll; focus starts on the way out.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Schedule the anchor's voice line by line on the server clock. A new story, muting, a new round or
  // closing the screen cancels it immediately.
  useEffect(() => {
    if (!segment || muted) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const serverNow = Date.now() + offsetRef.current;
    segment.lines.forEach((line, i) => {
      const startsIn = segment.startedAt + line.atMs - serverNow;
      if (startsIn < -LATE_SPEECH_MS) return;
      const key = `${segment.segmentId}#${i}`;
      timers.push(
        setTimeout(() => {
          speak(line.text, {
            onStart: () => setVoice({ ...silent, key, speaking: true }),
            onBoundary: (charIndex) => {
              setVoice((v) => (v.key === key ? { ...v, boundary: true, charIndex, mouthOpen: true } : v));
              timers.push(setTimeout(() => setVoice((v) => (v.key === key ? { ...v, mouthOpen: false } : v)), 130));
            },
            onEnd: () => setVoice((v) => (v.key === key ? silent : v)),
          });
        }, Math.max(0, startsIn)),
      );
    });
    return () => {
      timers.forEach(clearTimeout);
      cancel();
      setTimeout(() => setVoice(silent), 0);
    };
  }, [segment, muted, speak, cancel]);

  const elapsed = segment && now !== null ? now + serverOffset - segment.startedAt : null;
  // Skip stale stories: one that already ended (or arrived after it ended) is never played.
  const live = segment && elapsed !== null && elapsed < segment.durationMs && room.status === "ACTIVE" ? segment : null;
  const lineIndex = live ? live.lines.findLastIndex((l) => l.atMs <= elapsed!) : -1;
  const line = live && lineIndex >= 0 ? live.lines[lineIndex] : null;
  const lineKey = line ? `${live!.segmentId}#${lineIndex}` : null;
  const voiceOnLine = voice.speaking && voice.key === lineKey;
  const lineProgress = line ? Math.min(1, (elapsed! - line.atMs) / Math.max(1, line.durationMs - LINE_PAUSE_MS)) : 0;

  let mouth: MouthState = "closed";
  if (voiceOnLine) mouth = voice.boundary ? (voice.mouthOpen ? "open" : "closed") : "talk";
  else if (line && (muted || !canSpeak) && lineProgress < 1) mouth = "talk";

  let spoken = 0;
  if (line) {
    const raw = voiceOnLine && voice.boundary ? voice.charIndex : Math.round(lineProgress * line.text.length);
    const space = line.text.indexOf(" ", raw);
    spoken = lineProgress >= 1 ? line.text.length : space < 0 ? line.text.length : space;
  }

  const phaseLabel =
    room.status === "STARTING" ? "Market opens in" : room.status === "ACTIVE" ? "Trading closes in" : "Closing bell";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="MMN live newsroom"
      className="fixed inset-0 z-[60] flex flex-col bg-[#07090f] text-white"
    >
      <header className="relative z-20 flex items-center justify-between gap-2 bg-black/50 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-down px-2 py-0.5 text-xs font-extrabold tracking-[0.2em]">MMN</span>
          <LiveBadge on={room.status === "ACTIVE"} />
          <span className="hidden truncate text-xs text-white/60 sm:inline">Market Mayhem News</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="text-right">
            <div className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50 sm:block">{phaseLabel}</div>
            <span className="sr-only sm:hidden">{phaseLabel}</span>
            <div className="num font-mono text-lg font-bold leading-none">
              {room.status === "RESOLVING" ? "…" : formatClock(remaining)}
            </div>
          </div>
          {canSpeak && (
            <button
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
              className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to trading</span>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <StudioBackdrop />
        <div className="absolute top-[6%] right-[4%] aspect-video w-[52%] max-w-[560px] overflow-hidden rounded-lg border border-white/15 shadow-2xl sm:w-[40%]">
          {live ? <StoryArt key={live.segmentId} category={live.category} /> : <StandbyArt />}
        </div>
        <div className="absolute bottom-[16%] left-[4%] h-[58%] sm:left-[14%] sm:h-[62%]">
          <Anchor mouth={mouth} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[20%]">
          <NewsDesk />
          <span className="absolute top-[30%] left-1/2 -translate-x-1/2 rounded-md bg-down px-4 py-1 text-base font-extrabold tracking-[0.25em] sm:px-6 sm:text-2xl">
            MMN
          </span>
        </div>
        <div className="absolute inset-x-3 bottom-[22%] sm:inset-x-[8%]">
          <div className="flex items-stretch overflow-hidden rounded-md shadow-xl">
            <span className="grid shrink-0 place-items-center bg-down px-3 text-[10px] font-extrabold tracking-[0.18em] sm:text-xs">
              {live ? live.category.toUpperCase() : "MMN"}
            </span>
            <span className="flex-1 bg-white px-3 py-1.5 font-display text-lg leading-tight text-ink sm:py-2 sm:text-3xl">
              {live ? live.headline : room.status === "ACTIVE" ? "Live coverage continues" : "Market Mayhem News"}
            </span>
          </div>
        </div>
      </div>

      {/* Captions: always on. Screen readers get each whole line once, via the live region. */}
      <div className="min-h-[5.5rem] bg-black/85 px-4 py-3 sm:min-h-[6.5rem] sm:px-[8%]">
        <p className="sr-only" aria-live="polite">
          {line?.text ?? ""}
        </p>
        {line ? (
          <p aria-hidden="true" className="text-lg leading-snug font-medium sm:text-2xl">
            <span className="text-white">{line.text.slice(0, spoken)}</span>
            <span className="text-white/45">{line.text.slice(spoken)}</span>
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-white/60 sm:text-base">
            {room.status === "ACTIVE"
              ? "Stay with us. Stories air live and are never repeated."
              : room.status === "STARTING"
                ? "Coverage starts when the market opens."
                : "The closing bell has rung. Results are on their way."}
          </p>
        )}
        {!canSpeak && <p className="mt-1 text-xs text-white/45">Voice isn&apos;t available in this browser: captions only.</p>}
      </div>

      <p className="bg-black px-4 pt-1 text-[11px] text-white/45">Fictional simulation. Not financial advice.</p>
      <Ticker quotes={room.market?.quotes ?? []} />
    </div>
  );
}

/** Prices only: the ticker never explains a move. */
function Ticker({ quotes }: { quotes: AssetQuote[] }) {
  const items = (copy: number) =>
    quotes.map((q) => (
      <span key={`${copy}-${q.symbol}`} className="flex shrink-0 items-center gap-2 px-4 text-sm" aria-hidden={copy > 0}>
        <span className="font-mono font-semibold">{q.symbol}</span>
        <span className="num">{formatCredits(q.price)}</span>
        <span className={`num ${q.change > 0 ? "text-[#4ade80]" : q.change < 0 ? "text-[#ff7a70]" : "text-white/60"}`}>
          {arrow(q.change)} {formatPct(q.changePct)}
        </span>
      </span>
    ));
  return (
    <div className="mm-ticker overflow-hidden border-t border-white/10 bg-black py-2" aria-label="Live prices">
      <div className="mm-marquee flex w-max">
        {items(0)}
        {items(1)}
      </div>
    </div>
  );
}
