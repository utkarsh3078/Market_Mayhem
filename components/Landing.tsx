"use client";

import { useEffect, useState } from "react";
import { ASSETS } from "@/shared/assets";
import { MAX_DISPLAY_NAME, MAX_PLAYERS_PER_ROOM } from "@/shared/rules";
import { formatCredits } from "@/lib/format";
import type { GameActions, GameState } from "@/lib/useGame";
import { Button, ConfidenceBadge, ConnectionDot, Logo, Pill, Sparkline } from "./ui";

const NAME_KEY = "mm.name";
const STEP_MS = 4000;

const STEPS = [
  {
    title: "Open a room",
    body: "Create a room and share the 5-letter code. Everyone starts with 100,000 virtual credits.",
  },
  {
    title: "Read the news, guard your clue",
    body: "Headlines reach everyone at once. Your private clue reaches only you, and it might be wrong.",
  },
  {
    title: "Trade before the bell",
    body: "Buy and sell five fictional companies. At the bell the hidden event resolves and the best portfolio wins.",
  },
];

export function Landing({ state, actions }: { state: GameState; actions: GameActions }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  // Restore the remembered name and any invite code from the URL (client-only values).
  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem(NAME_KEY) ?? "";
    } catch {}
    const invite = new URLSearchParams(window.location.search).get("room") ?? "";
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from browser storage */
    if (stored) setName(stored);
    if (invite) setCode(invite.toUpperCase().slice(0, 5));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const connected = state.connection === "connected" && !!state.session;
  const trimmed = name.trim();

  async function run(kind: "create" | "join") {
    if (!trimmed) {
      setError("Enter a display name first.");
      return;
    }
    if (kind === "join" && code.trim().length !== 5) {
      setError("Room codes are 5 letters/numbers.");
      return;
    }
    setError(null);
    setBusy(kind);
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {}
    const res = kind === "create" ? await actions.createRoom(trimmed) : await actions.joinRoom(code.trim(), trimmed);
    setBusy(null);
    if (!res.ok) setError(res.error.message);
  }

  return (
    <div className="flex flex-1 flex-col bg-night">
      <div className="relative z-10 flex flex-1 flex-col rounded-b-[40px] bg-bg pb-16 sm:rounded-b-[56px]">
        <nav className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-4 py-5 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
          <Logo />
          <div className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
            <a href="#assets" className="hover:text-ink">
              Assets
            </a>
            <a href="#play" className="hover:text-ink">
              Play
            </a>
          </div>
          <div className="flex items-center justify-end gap-3">
            <ConnectionDot status={state.connection} />
            <a
              href="#play"
              className="hidden rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/85 sm:inline-flex"
            >
              Play now
            </a>
          </div>
        </nav>

        {/* Hero: centered serif headline in a warm panel, play card floating at the bottom */}
        <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="rounded-[32px] bg-panel-2 px-5 pt-14 pb-8 text-center sm:px-10 sm:pt-20 sm:pb-12">
            <p className="eyebrow rise-in">A social-deduction trading game</p>
            <h1 className="rise-in mx-auto mt-4 max-w-3xl font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">
              Markets run on information. <span className="text-muted italic">Yours is incomplete.</span>
            </h1>
            <p className="rise-in mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg [animation-delay:80ms]">
              Trade fictional assets, read the news, and weigh a private clue nobody else has. Finish with the strongest
              portfolio when the hidden event resolves.
            </p>
            <div className="rise-in mt-7 flex flex-wrap justify-center gap-2 [animation-delay:140ms]">
              <Pill className="bg-panel">2–{MAX_PLAYERS_PER_ROOM} players</Pill>
              <Pill className="bg-panel">5-minute rounds</Pill>
              <Pill className="bg-panel">No real money</Pill>
            </div>

            <div
              id="play"
              className="rise-in mx-auto mt-10 max-w-md scroll-mt-6 rounded-3xl border border-line bg-panel p-5 text-left shadow-card sm:p-6 [animation-delay:200ms]"
            >
              <label htmlFor="name" className="eyebrow">
                Display name
              </label>
              <input
                id="name"
                value={name}
                maxLength={MAX_DISPLAY_NAME}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run(code ? "join" : "create")}
                placeholder="e.g. Ada"
                autoComplete="nickname"
                className="mt-2 w-full rounded-xl border border-line-strong bg-bg px-4 py-3 text-base outline-none placeholder:text-faint focus:border-ink"
              />

              <Button className="mt-4 w-full py-3" disabled={!connected || busy !== null} onClick={() => run("create")}>
                {busy === "create" ? "Creating…" : "Create a room"}
              </Button>

              <div className="my-5 flex items-center gap-3 text-xs text-faint">
                <span className="h-px flex-1 bg-line" /> or join a friend <span className="h-px flex-1 bg-line" />
              </div>

              <div className="flex gap-2">
                <label htmlFor="code" className="sr-only">
                  Room code
                </label>
                <input
                  id="code"
                  value={code}
                  maxLength={5}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && run("join")}
                  placeholder="ROOM CODE"
                  autoCapitalize="characters"
                  className="min-w-0 flex-1 rounded-full border border-line-strong bg-bg px-4 py-3 font-mono text-base tracking-[0.3em] uppercase outline-none placeholder:tracking-normal placeholder:text-faint focus:border-ink"
                />
                <Button variant="secondary" disabled={!connected || busy !== null} onClick={() => run("join")}>
                  {busy === "join" ? "Joining…" : "Join"}
                </Button>
              </div>

              {error && (
                <p role="alert" className="mt-3 rounded-xl bg-down/8 px-3 py-2 text-sm text-down">
                  {error}
                </p>
              )}
              {!connected && state.connection !== "connecting" && (
                <p className="mt-3 rounded-xl bg-warn/8 px-3 py-2 text-sm text-warn">
                  Can&apos;t reach the game server. Is it running on port 4000? (<code>pnpm dev</code> starts both.)
                </p>
              )}
            </div>
          </div>
        </section>

        <AssetTicker />
        <HowItWorks />
      </div>

      <Footer />
    </div>
  );
}

/** Edge-bleeding infinite row of the five tradable companies. */
function AssetTicker() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 gap-3 pr-3" aria-hidden={hidden || undefined}>
      {ASSETS.map((a) => (
        <li
          key={a.symbol}
          className="flex items-center gap-3 rounded-2xl border border-line bg-panel py-2.5 pr-5 pl-2.5 whitespace-nowrap"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-bg font-mono text-[11px] font-bold">
            {a.symbol}
          </span>
          <span>
            <span className="block text-sm font-semibold">{a.name}</span>
            <span className="block text-xs text-muted">
              {a.sector} · <span className="num">{formatCredits(a.initialPrice)}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <section id="assets" className="mt-14 scroll-mt-6" aria-label="Tradable assets">
      <p className="eyebrow text-center">Five fictional companies, one hidden event</p>
      <div className="marquee mt-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <div className="marquee-track flex w-max">
          {row(false)}
          {row(true)}
          {row(true)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-cycle the highlighted step, unless the visitor prefers reduced motion or is interacting.
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((i) => (i + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, [paused]);

  const focus = (i: number) => {
    setActive(i);
    setPaused(true);
  };

  return (
    <section
      id="how"
      className="mx-auto mt-20 w-full max-w-6xl scroll-mt-6 px-4 sm:px-6"
      onMouseLeave={() => setPaused(false)}
    >
      <p className="eyebrow">How it works</p>
      <h2 className="mt-4 space-y-1 text-2xl leading-snug font-medium tracking-tight sm:text-3xl">
        {STEPS.map((s, i) => (
          <span
            key={s.title}
            className={`block transition-colors duration-300 ${i === active ? "text-ink" : "text-ink/30"}`}
          >
            {s.title}
            <sup className={`ml-1 font-mono text-xs ${i === active ? "text-accent" : "text-ink/30"}`}>0{i + 1}</sup>
          </span>
        ))}
      </h2>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onMouseEnter={() => focus(i)}
            onFocus={() => focus(i)}
            onClick={() => focus(i)}
            aria-pressed={i === active}
            className="group text-left focus-visible:outline-none"
          >
            <div
              className={`grid h-52 place-items-center overflow-hidden rounded-3xl border bg-panel p-5 transition-all duration-300 group-focus-visible:outline-2 group-focus-visible:outline-accent ${
                i === active ? "border-line-strong shadow-card md:scale-[1.02]" : "border-line"
              }`}
            >
              {i === 0 ? <MockRoom /> : i === 1 ? <MockIntel /> : <MockBoard />}
            </div>
            <div className="mt-5 flex gap-3 px-1">
              <span className={`font-mono text-xs ${i === active ? "text-accent-ink" : "text-faint"}`}>0{i + 1}</span>
              <span>
                <span className="block text-sm font-semibold">{s.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{s.body}</span>
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MockRoom() {
  return (
    <div className="flex flex-col items-center gap-4" aria-hidden="true">
      <span className="rounded-2xl border border-line bg-bg px-5 py-2 font-mono text-3xl font-bold tracking-[0.25em]">
        K7QXM
      </span>
      <div className="flex -space-x-2">
        {["A", "B", "C", "D"].map((l, i) => (
          <span
            key={l}
            className={`grid h-8 w-8 place-items-center rounded-full border-2 border-panel text-xs font-bold ${
              i === 0 ? "bg-ink text-white" : "bg-panel-2 text-ink"
            }`}
          >
            {l}
          </span>
        ))}
      </div>
      <span className="rounded-full bg-panel-2 px-3 py-1 text-xs text-muted">Copy invite link</span>
    </div>
  );
}

function MockIntel() {
  return (
    <div className="flex w-full max-w-60 flex-col gap-2.5" aria-hidden="true">
      <div className="rounded-xl border border-line bg-bg px-3 py-2">
        <div className="eyebrow text-[9px]">Breaking · Market</div>
        <div className="mt-1 h-2 w-4/5 rounded-full bg-ink/15" />
        <div className="mt-1.5 h-2 w-3/5 rounded-full bg-ink/10" />
      </div>
      <div className="rounded-xl border border-accent/40 bg-panel px-3 py-2.5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold tracking-wider whitespace-nowrap text-accent-ink uppercase">
            Private
          </span>
          <ConfidenceBadge level="MEDIUM" />
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-accent/20" />
        <div className="mt-1.5 h-2 w-2/3 rounded-full bg-accent/15" />
      </div>
    </div>
  );
}

function MockBoard() {
  const rows = [
    { n: "Ada", pct: "+4.12%", up: true, line: [3, 4, 3.5, 5, 6, 5.5, 7] },
    { n: "Grace", pct: "+1.08%", up: true, line: [4, 3.8, 4.2, 4.1, 4.6, 4.4, 4.8] },
    { n: "Linus", pct: "−2.37%", up: false, line: [6, 6.2, 5.4, 5.6, 4.8, 4.2, 4] },
  ];
  return (
    <ol className="w-full max-w-60 divide-y divide-line rounded-xl border border-line bg-bg" aria-hidden="true">
      {rows.map((r, i) => (
        <li key={r.n} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
          <span className="flex items-center gap-2">
            <span className="font-mono text-faint">#{i + 1}</span>
            <span className="font-semibold">{r.n}</span>
          </span>
          <Sparkline values={r.line} width={54} height={18} />
          <span className={`num font-semibold ${r.up ? "text-up" : "text-down"}`}>{r.pct}</span>
        </li>
      ))}
    </ol>
  );
}

function Footer() {
  return (
    <footer className="bg-night px-4 pt-16 pb-8 text-white sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="font-display text-5xl tracking-tight sm:text-6xl">
            Market <span className="italic">Mayhem</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">
            Learn how information, rumors and timing move markets, by trading against your friends.
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-[0.14em] text-white/50 uppercase">Play</div>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li>
              <a href="#play" className="hover:text-white">
                Create a room
              </a>
            </li>
            <li>
              <a href="#play" className="hover:text-white">
                Join with a code
              </a>
            </li>
            <li>
              <a href="#how" className="hover:text-white">
                How it works
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-[0.14em] text-white/50 uppercase">The fine print</div>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            <li>Fictional companies and events</li>
            <li>Virtual credits only</li>
            <li>Not financial advice</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-14 flex max-w-6xl flex-wrap justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/45">
        <span>Educational simulation. All assets, prices and events are made up.</span>
        <span>Market Mayhem · 2026</span>
      </div>
    </footer>
  );
}
