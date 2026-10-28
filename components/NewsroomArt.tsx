// Inline SVG art for the Live Newsroom studio: no photos, no downloads. Motion classes (mm-*) are
// defined in globals.css and only animate when the viewer hasn't asked for reduced motion.

export type MouthState = "closed" | "open" | "talk";

export function StudioBackdrop() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mm-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d1b36" />
          <stop offset="1" stopColor="#1b1238" />
        </linearGradient>
        <linearGradient id="mm-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#21407a" />
          <stop offset="1" stopColor="#0f1f42" />
        </linearGradient>
        <linearGradient id="mm-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141a2e" />
          <stop offset="1" stopColor="#07090f" />
        </linearGradient>
        <radialGradient id="mm-glow" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#4d7cff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#4d7cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#mm-wall)" />
      {/* Wall panels */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={i * 180 - 20} y="0" width="170" height="640" fill="#ffffff" opacity="0.025" />
      ))}
      {/* Main screen with a skyline */}
      <rect x="230" y="90" width="1140" height="470" rx="18" fill="url(#mm-screen)" stroke="#3a5aa0" strokeOpacity="0.5" strokeWidth="4" />
      <path
        d="M230 560 V430 h70 v-60 h50 v90 h40 v-140 h60 v140 h50 v-80 h70 v-50 h40 v130 h60 v-170 h50 v170 h40 v-90 h80 v-40 h50 v130 h60 v-110 h50 v110 h40 v-60 h70 v120 h40 v-150 h60 v150 h80 v-70 h50 v130 Z"
        fill="#0a1530"
        opacity="0.9"
      />
      <rect x="230" y="90" width="1140" height="470" rx="18" fill="url(#mm-glow)" />
      {/* Side screens */}
      <rect x="40" y="140" width="150" height="360" rx="12" fill="#13244a" opacity="0.8" />
      <rect x="1410" y="140" width="150" height="360" rx="12" fill="#13244a" opacity="0.8" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} opacity="0.5">
          <rect x="62" y={170 + i * 52} width={60 + ((i * 37) % 50)} height="10" rx="5" fill="#6d8fd8" />
          <rect x="1432" y={170 + i * 52} width={50 + ((i * 53) % 60)} height="10" rx="5" fill="#6d8fd8" />
        </g>
      ))}
      {/* Floor and lights */}
      <rect y="640" width="1600" height="260" fill="url(#mm-floor)" />
      <polygon points="300,0 380,0 620,640 420,640" fill="#ffffff" opacity="0.03" />
      <polygon points="1220,0 1300,0 1180,640 980,640" fill="#ffffff" opacity="0.03" />
    </svg>
  );
}

/** Stretches to the stage width; the channel logo sits on top as HTML so it never distorts. */
export function NewsDesk() {
  return (
    <svg className="h-full w-full" viewBox="0 0 800 120" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="mm-desk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3556" />
          <stop offset="1" stopColor="#141a2e" />
        </linearGradient>
      </defs>
      <path d="M40 0 H760 L800 120 H0 Z" fill="url(#mm-desk)" />
      <rect x="40" y="0" width="720" height="8" fill="#5b74b8" opacity="0.7" />
    </svg>
  );
}

export function Anchor({ mouth }: { mouth: MouthState }) {
  return (
    <svg viewBox="0 0 240 260" className="h-full w-auto" role="img" aria-label="MMN news anchor">
      {/* Suit, shirt and tie */}
      <path d="M24 260 C28 204 66 182 120 180 C174 182 212 204 216 260 Z" fill="#1f2a44" />
      <path d="M100 182 L120 232 L140 182 Z" fill="#f3f1ee" />
      <path d="M100 182 L120 234 L90 206 Z" fill="#17203a" />
      <path d="M140 182 L120 234 L150 206 Z" fill="#17203a" />
      <path d="M115 188 H125 L129 226 L120 238 L111 226 Z" fill="#8f2b2b" />
      <rect x="106" y="148" width="28" height="38" rx="11" fill="#c98f6b" />
      <g className="mm-anchor-head">
        <ellipse cx="120" cy="94" rx="54" ry="60" fill="#2b1d16" />
        <ellipse cx="76" cy="108" rx="7" ry="12" fill="#c98f6b" />
        <ellipse cx="164" cy="108" rx="7" ry="12" fill="#c98f6b" />
        <ellipse cx="120" cy="106" rx="44" ry="54" fill="#d9a37f" />
        <path d="M74 94 C74 52 108 38 132 42 C158 46 172 66 166 94 C152 72 122 64 98 72 C86 77 78 85 74 94 Z" fill="#2b1d16" />
        <path d="M93 89 Q103 83 112 88" stroke="#2b1d16" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M128 88 Q137 83 147 89" stroke="#2b1d16" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <g className="mm-blink">
          <ellipse cx="103" cy="102" rx="5" ry="5.5" fill="#1e1d1b" />
          <ellipse cx="137" cy="102" rx="5" ry="5.5" fill="#1e1d1b" />
        </g>
        <path d="M120 108 Q115 121 121 125" stroke="#b9805e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <ellipse
          className={mouth === "talk" ? "mm-talk" : undefined}
          cx="120"
          cy="138"
          rx="11"
          ry={mouth === "closed" ? 1.8 : 6}
          fill="#7a2e2a"
        />
      </g>
    </svg>
  );
}

const SCENES: Record<string, React.ReactNode> = {
  weather: (
    <>
      <rect width="320" height="180" fill="#7fb3e6" />
      <circle cx="235" cy="55" r="28" fill="#ffd257" />
      <g fill="#ffffff">
        <circle cx="110" cy="80" r="26" />
        <circle cx="140" cy="68" r="32" />
        <circle cx="175" cy="82" r="24" />
        <rect x="88" y="80" width="110" height="26" rx="13" />
      </g>
      <path d="M0 150 Q80 130 160 148 T320 140 V180 H0 Z" fill="#5f9e5a" />
    </>
  ),
  sports: (
    <>
      <rect width="320" height="180" fill="#2f8a4a" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 80} width="40" height="180" fill="#ffffff" opacity="0.06" />
      ))}
      <g stroke="#ffffff" strokeWidth="3" fill="none" opacity="0.85">
        <rect x="20" y="20" width="280" height="140" />
        <line x1="160" y1="20" x2="160" y2="160" />
        <circle cx="160" cy="90" r="28" />
      </g>
      <circle cx="210" cy="112" r="12" fill="#ffffff" />
      <path d="M210 104 l6 5 -2 7 h-8 l-2 -7 Z" fill="#1e1d1b" />
    </>
  ),
  culture: (
    <>
      <rect width="320" height="180" fill="#2a0f14" />
      <polygon points="160,0 110,180 210,180" fill="#fff6d6" opacity="0.18" />
      <path d="M0 0 H70 C60 60 70 120 40 180 H0 Z" fill="#8f1d2c" />
      <path d="M320 0 H250 C260 60 250 120 280 180 H320 Z" fill="#8f1d2c" />
      <rect x="0" y="0" width="320" height="18" fill="#6b1420" />
      <rect x="60" y="150" width="200" height="30" fill="#3a2418" />
      <circle cx="160" cy="118" r="16" fill="#f3d9b1" />
      <rect x="148" y="132" width="24" height="20" rx="6" fill="#1e1d1b" />
    </>
  ),
  world: (
    <>
      <rect width="320" height="180" fill="#0d1733" />
      {[30, 70, 260, 290, 45, 230].map((x, i) => (
        <circle key={i} cx={x} cy={20 + ((i * 47) % 140)} r="1.6" fill="#ffffff" />
      ))}
      <circle cx="160" cy="90" r="62" fill="#2f6fb5" />
      <path d="M120 60 q20 -10 30 5 q10 20 -10 30 q-15 5 -20 -10 Z M170 95 q25 -5 30 15 q-5 20 -25 18 q-10 -15 -5 -33 Z" fill="#5fae6a" />
      <g stroke="#ffffff" strokeOpacity="0.35" fill="none" strokeWidth="1.5">
        <ellipse cx="160" cy="90" rx="62" ry="22" />
        <ellipse cx="160" cy="90" rx="25" ry="62" />
      </g>
    </>
  ),
  energy: (
    <>
      <rect width="320" height="180" fill="#f2a65a" />
      <rect y="120" width="320" height="60" fill="#5a3b2e" />
      <circle cx="250" cy="120" r="30" fill="#ffd27a" />
      {[70, 190].map((x) => (
        <g key={x} stroke="#2b2b2b" strokeWidth="3" fill="none">
          <path d={`M${x} 160 L${x + 15} 40 L${x + 30} 160 M${x + 4} 120 H${x + 26} M${x + 8} 90 H${x + 22} M${x - 5} 55 H${x + 35}`} />
        </g>
      ))}
      <path d="M0 62 Q42 80 80 56 Q140 80 200 56 Q260 80 320 62" stroke="#2b2b2b" strokeWidth="2" fill="none" />
      <path d="M150 30 l-14 30 h12 l-8 26 22 -34 h-12 l8 -22 Z" fill="#ffe14d" stroke="#2b2b2b" strokeWidth="1.5" />
    </>
  ),
  shipping: (
    <>
      <rect width="320" height="180" fill="#9ec9e8" />
      <rect y="118" width="320" height="62" fill="#2d5f8f" />
      <path d="M50 110 H270 L250 140 H70 Z" fill="#1e1d1b" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={80 + i * 34} y="86" width="30" height="24" fill={["#c0352b", "#2f6fb5", "#e0a030", "#3c8c5a", "#7a4fa0"][i]} />
          {i % 2 === 0 && <rect x={80 + i * 34} y="62" width="30" height="24" fill={["#2f6fb5", "#c0352b", "#3c8c5a"][i / 2]} />}
        </g>
      ))}
      <path d="M0 150 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="3" fill="none" />
    </>
  ),
  farm: (
    <>
      <rect width="320" height="180" fill="#bfe0f2" />
      <circle cx="60" cy="45" r="22" fill="#ffd257" />
      <polygon points="0,90 320,80 320,180 0,180" fill="#d9b44a" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${-40 + i * 60} 180 L${120 + i * 20} 85`} stroke="#a8862c" strokeWidth="5" />
      ))}
      <rect x="220" y="55" width="50" height="40" fill="#a33b2b" />
      <polygon points="215,58 245,35 275,58" fill="#7a2a1f" />
    </>
  ),
  factory: (
    <>
      <rect width="320" height="180" fill="#c9cdd6" />
      <g fill="#ffffff" opacity="0.7">
        <circle cx="236" cy="34" r="14" />
        <circle cx="256" cy="24" r="18" />
        <circle cx="280" cy="30" r="12" />
      </g>
      <rect x="230" y="40" width="22" height="80" fill="#4b4f5c" />
      <path d="M30 150 V90 l50 -30 v30 l50 -30 v30 l50 -30 v30 l50 -30 v90 Z" fill="#5d6272" />
      <rect y="150" width="320" height="30" fill="#3b3e48" />
      {[50, 100, 150, 200].map((x) => (
        <rect key={x} x={x} y="115" width="24" height="18" fill="#ffd257" opacity="0.8" />
      ))}
    </>
  ),
  tech: (
    <>
      <rect width="320" height="180" fill="#0f1d2e" />
      <g stroke="#3fd0c9" strokeOpacity="0.5" strokeWidth="2" fill="none">
        <path d="M0 40 H90 V70 M320 40 H230 V70 M0 140 H90 V110 M320 140 H230 V110 M160 0 V40 M160 180 V140" />
      </g>
      <rect x="110" y="40" width="100" height="100" rx="10" fill="#1d3b57" stroke="#3fd0c9" strokeWidth="3" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} fill="#3fd0c9">
          <rect x={120 + i * 18} y="30" width="6" height="10" />
          <rect x={120 + i * 18} y="140" width="6" height="10" />
          <rect x="100" y={50 + i * 18} width="10" height="6" />
          <rect x="210" y={50 + i * 18} width="10" height="6" />
        </g>
      ))}
      <rect x="135" y="65" width="50" height="50" rx="6" fill="#3fd0c9" opacity="0.35" />
    </>
  ),
  bank: (
    <>
      <rect width="320" height="180" fill="#e9e4da" />
      <polygon points="160,20 270,60 50,60" fill="#8a8273" />
      <rect x="60" y="60" width="200" height="12" fill="#6e675a" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={74 + i * 38} y="76" width="16" height="70" fill="#b3ab9b" />
      ))}
      <rect x="50" y="146" width="220" height="14" fill="#6e675a" />
      <rect x="40" y="160" width="240" height="10" fill="#57514a" />
    </>
  ),
  market: (
    <>
      <rect width="320" height="180" fill="#101826" />
      <g stroke="#ffffff" strokeOpacity="0.08">
        {[30, 60, 90, 120, 150].map((y) => (
          <line key={y} x1="0" y1={y} x2="320" y2={y} />
        ))}
      </g>
      <polyline points="10,140 50,120 80,128 120,90 150,100 190,60 220,75 260,40 310,50" fill="none" stroke="#3ccf6e" strokeWidth="4" />
      <polyline points="10,60 50,80 90,70 130,110 170,100 210,130 250,120 310,150" fill="none" stroke="#e5534b" strokeWidth="3" opacity="0.7" />
    </>
  ),
};

/** Over-the-shoulder story graphic. Unknown categories get a plain card with the category name. */
export function StoryArt({ category }: { category: string }) {
  const scene = SCENES[category];
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" role="img" aria-label={`${category} story graphic`}>
      <g className="mm-pan">
        {scene ?? (
          <>
            <rect width="320" height="180" fill="#1d2a4a" />
            <text x="160" y="100" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="28" fill="#ffffff" letterSpacing="4">
              {category.toUpperCase()}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}

/** Shown between stories: the channel ident, never a past story. */
export function StandbyArt() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" role="img" aria-label="MMN ident">
      <rect width="320" height="180" fill="#101a33" />
      <circle cx="160" cy="90" r="70" fill="none" stroke="#c0352b" strokeWidth="3" opacity="0.6" />
      <text x="160" y="104" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="44" fill="#ffffff" letterSpacing="6">
        MMN
      </text>
    </svg>
  );
}
