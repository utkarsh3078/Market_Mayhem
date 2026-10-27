import type { BalanceHints, ScenarioConfig } from "./types";

// Server-only: this file contains the hidden truth and must never be imported by the web app.
//
// Hidden truth: the rate-hike rumor is true, and the hike is steep. Higher rates widen MetroBank's
// lending margins, while Quantum Motors, whose buyers rely on car loans, takes the hit. An official's
// calming remark mid-round is a red herring. AgriCore's export deal is unrelated good news.

export const rateShock: ScenarioConfig = {
  id: "rate-shock",
  version: 1,
  name: "The Rate Shock",
  teaser: "Whispers of a big interest-rate hike are everywhere. Who wins if money gets expensive?",
  seed: "rate-shock-demo-v1",
  totalTicks: 90,
  noise: 0.004,
  marketNoise: 0.0015,
  events: [
    { id: "hike-rumor", startTick: 6, endTick: 28, perTick: { MTB: 0.003, QTM: -0.003, CLD: -0.0015 } },
    { id: "calming-words", startTick: 30, endTick: 40, perTick: { MTB: -0.003, QTM: 0.0035 } },
    { id: "hike-priced-in", startTick: 44, endTick: 72, perTick: { MTB: 0.0045, QTM: -0.005, CLD: -0.002 } },
    { id: "export-deal", startTick: 48, endTick: 76, perTick: { AGR: 0.0045 } },
    { id: "steady-power", startTick: 10, endTick: 80, perTick: { NVE: 0.0008 } },
    { id: "cloud-contracts", startTick: 72, endTick: 88, perTick: { CLD: 0.003 } },
  ],
  news: [
    {
      id: "n-open",
      tick: 2,
      category: "Market",
      headline: "Central bank rate decision due at today's close",
      body: "Every desk is watching the announcement. Officials have kept their plans quiet.",
    },
    {
      id: "n-rumor",
      tick: 6,
      category: "Policy",
      headline: "Economists whisper of a larger-than-expected rate hike",
      body: "Several research notes now pencil in the steepest increase in years.",
    },
    {
      id: "n-yields",
      tick: 18,
      category: "Technology",
      headline: "Growth stocks wobble as bond yields climb",
      body: "Fast-growing tech names slip as investors demand higher returns elsewhere.",
    },
    {
      id: "n-calm",
      tick: 30,
      category: "Policy",
      headline: "Central bank official: 'no need for drastic moves'",
      body: "A board member urged patience in a radio interview. It was not an official statement.",
    },
    {
      id: "n-loans",
      tick: 38,
      category: "Mobility",
      headline: "Quantum Motors reports record car-loan orders",
      body: "Buyers rushed to lock in financing this month. Dealers say demand is strong.",
    },
    {
      id: "n-priced",
      tick: 44,
      category: "Banking",
      headline: "Bond markets now price in a steep hike",
      body: "Trading in rate futures points to a large increase at the close.",
    },
    {
      id: "n-export",
      tick: 50,
      category: "Agriculture",
      headline: "AgriCore signs new grain export agreement",
      body: "The multi-year deal opens two new overseas markets.",
    },
    {
      id: "n-weather",
      tick: 60,
      category: "Weather",
      headline: "Mild weather expected across the region",
      body: "Forecasters see a calm week ahead with no major storms.",
    },
    {
      id: "n-close",
      tick: 84,
      category: "Market",
      headline: "Rate decision to be announced at the bell",
      body: "Positions lock when trading ends. The decision follows immediately.",
    },
  ],
  clues: [
    {
      id: "margin-memo",
      title: "Lending margins set to widen",
      content:
        "An internal MetroBank memo models profits rising sharply if rates go up, because loan rates reprice faster than deposits.",
      confidence: "HIGH",
      hint: "Banks earn the gap between what they lend at and what they pay savers.",
    },
    {
      id: "dealer-squeeze",
      title: "Dealer financing squeeze",
      content:
        "A car-dealer contact says buyers are already walking away when shown loan repayments at the new rates.",
      confidence: "MEDIUM",
      hint: "Record orders today can mean buyers rushing before the door closes.",
    },
    {
      id: "export-real",
      title: "The export deal is solid",
      content: "A shipping broker confirms AgriCore's first export cargoes are already booked.",
      confidence: "MEDIUM",
      hint: "Some good news has nothing to do with the main story.",
    },
    {
      id: "takeover-whisper",
      title: "Takeover whisper",
      content: "A forum post claims a giant is about to bid for CloudForge at a big premium.",
      confidence: "LOW",
      hint: "Anonymous, unsourced, and exactly what someone holding the stock would want you to believe.",
    },
    {
      id: "steady-demand",
      title: "Power demand is steady",
      content: "Grid data shows Nova Energy's demand barely moves with interest rates.",
      confidence: "MEDIUM",
      hint: "Not every company cares about the headline of the day.",
    },
  ],
  resolution: {
    headline: "Rates rose, and the bank won",
    summary:
      "The central bank raised rates more than anyone officially admitted. MetroBank's margins widened, while Quantum Motors' customers suddenly faced expensive car loans. The calming remark was one voice, not the decision.",
    shock: { MTB: 0.07, QTM: -0.08, CLD: -0.02, AGR: 0.03, NVE: 0.01 },
    explanations: {
      NVE: "Barely affected. Power demand doesn't change much with interest rates, so Nova Energy drifted gently upward.",
      CLD: "Growth stocks fall when rates rise because future profits are worth less today. The takeover rumor was false.",
      AGR: "The export deal was real and unrelated to rates, so AgriCore rose on its own news.",
      QTM: "Record loan orders were buyers rushing before rates rose. Once the hike landed, financing a car got much more expensive.",
      MTB: "Higher rates let the bank charge more on loans faster than it pays savers, widening its profit margin.",
    },
    lessons: [
      "One event can push different sectors in opposite directions. Ask who pays and who earns when it happens.",
      "A single official's comment is not the decision. Weigh who is speaking and whether it is official.",
      "A record month can be a rush before a door closes, not lasting demand.",
    ],
  },
};

/** What each clue and headline suggests; used only by the balance simulator. */
export const rateShockHints: BalanceHints = {
  clues: {
    "margin-memo": { symbol: "MTB", action: "BUY" },
    "dealer-squeeze": { symbol: "QTM", action: "AVOID" },
    "export-real": { symbol: "AGR", action: "BUY" },
    "takeover-whisper": { symbol: "CLD", action: "BUY" },
    "steady-demand": { symbol: "NVE", action: "BUY" },
  },
  praises: {
    "n-calm": "QTM",
    "n-loans": "QTM",
    "n-export": "AGR",
  },
};
