"use client";

import { useCallback, useEffect, useRef } from "react";

// Browser text-to-speech for the Live Newsroom anchor (Web Speech API: free, no key, no server).
// Captions never depend on it: they run on the server clock, and the voice follows them.

export interface SpeakHandlers {
  onStart?: () => void;
  /** Character offset of the word being spoken. Not every voice fires these (many network voices don't). */
  onBoundary?: (charIndex: number) => void;
  onEnd?: () => void;
}

const synth = (): SpeechSynthesis | null =>
  typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

export const speechSupported = () => synth() !== null;

/** English only; prefer natural-sounding voices, then the common good defaults on each platform. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online/i.test(v.name) ? 4 : 0) +
    (/google|samantha|daniel|aria|jenny|guy|serena|karen|moira|alex/i.test(v.name) ? 2 : 0) +
    (/^en[-_](us|gb)/i.test(v.lang) ? 1 : 0) +
    (v.default ? 0.5 : 0);
  return english.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Mobile browsers only allow speech that starts inside a user gesture. Call this from the click that
 * opens the newsroom; later utterances are then allowed without one.
 */
export function unlockSpeech(): void {
  const s = synth();
  if (!s) return;
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0;
  s.speak(silent);
}

export function useSpeech() {
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const s = synth();
    if (!s) return;
    // Voices load asynchronously in most browsers.
    const load = () => {
      voice.current = pickVoice(s.getVoices());
    };
    load();
    s.addEventListener("voiceschanged", load);
    return () => {
      s.removeEventListener("voiceschanged", load);
      s.cancel();
    };
  }, []);

  const cancel = useCallback(() => synth()?.cancel(), []);

  /** Speaks one caption line, replacing anything still queued. Lines are short, which avoids Chrome cutting off long utterances. */
  const speak = useCallback((text: string, handlers: SpeakHandlers = {}) => {
    const s = synth();
    if (!s) return;
    s.cancel();
    // Chrome can leave the queue paused (e.g. after the tab was hidden); resume before speaking.
    s.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice.current?.lang ?? "en-US";
    if (voice.current) u.voice = voice.current;
    u.rate = 1.05;
    u.onstart = () => handlers.onStart?.();
    u.onboundary = (e) => {
      if (e.name === "word" || e.name === undefined) handlers.onBoundary?.(e.charIndex);
    };
    u.onend = () => handlers.onEnd?.();
    u.onerror = () => handlers.onEnd?.();
    s.speak(u);
  }, []);

  return { speak, cancel };
}
