import type { BalanceHints, ScenarioConfig } from "./types";

// Server-only: this file contains the hidden truth and must never be imported by the web app.
//
// Hidden truth: Quantum Motors' "battery breakthrough" works in the lab but is years from mass
// production. The hype lifts the stock, then reality deflates it. The quiet winner is Nova Energy,
// whose grid-upgrade contract is larger than announced. The MetroBank "plant financing" story is false.

export const batteryHype: ScenarioConfig = {
  id: "battery-hype",
  version: 1,
  name: "The Battery Hype",
  teaser: "Quantum Motors teases a battery that could change everything. Is it the future, or just a headline?",
  seed: "battery-hype-demo-v1",
  totalTicks: 90,
  noise: 0.004,
  marketNoise: 0.0015,
  events: [
    { id: "hype-run", startTick: 4, endTick: 20, perTick: { QTM: 0.006 } },
    { id: "reality-check", startTick: 40, endTick: 80, perTick: { QTM: -0.006 } },
    { id: "grid-early", startTick: 30, endTick: 60, perTick: { NVE: 0.001 } },
    { id: "grid-details", startTick: 60, endTick: 86, perTick: { NVE: 0.004 } },
    { id: "ai-workloads", startTick: 14, endTick: 30, perTick: { CLD: 0.003 } },
    { id: "dry-spell", startTick: 20, endTick: 40, perTick: { AGR: -0.002 } },
    { id: "rain-returns", startTick: 40, endTick: 58, perTick: { AGR: 0.0045 } },
    { id: "rate-worries", startTick: 10, endTick: 62, perTick: { MTB: -0.0012 } },
  ],
  news: [
    {
      id: "n-open",
      tick: 2,
      category: "Market",
      headline: "Investors eye a busy week of tech announcements",
      body: "Several companies have scheduled product events.",
    },
    {
      id: "n-tease",
      tick: 8,
      category: "Mobility",
      headline: "Quantum Motors teases a 'battery breakthrough'",
      body: "The company promises an announcement that will 'redefine electric driving'.",
    },
    {
      id: "n-range",
      tick: 20,
      category: "Mobility",
      headline: "Analysts: new battery could double EV range",
      body: "Early lab results shared with analysts look impressive. No production date was given.",
    },
    {
      id: "n-dry",
      tick: 22,
      category: "Agriculture",
      headline: "Dry spell worries farmers",
      body: "A fourth week without rain has growers warning about smaller harvests.",
    },
    {
      id: "n-ai",
      tick: 30,
      category: "Technology",
      headline: "CloudForge sees a surge in AI workloads",
      body: "Usage of its machine-learning servers doubled this quarter.",
    },
    {
      id: "n-record",
      tick: 36,
      category: "Mobility",
      headline: "Quantum Motors stock hits an all-time high",
      body: "Retail investors piled in after the battery news.",
    },
    {
      id: "n-grid",
      tick: 40,
      category: "Energy",
      headline: "Nova Energy wins a regional grid-upgrade contract",
      body: "The utility will modernise transmission lines across three districts. Value undisclosed.",
    },
    {
      id: "n-years",
      tick: 52,
      category: "Mobility",
      headline: "Engineers say mass production is 'years away'",
      body: "Independent experts note the new cells have only been made in small lab batches.",
    },
    {
      id: "n-rain",
      tick: 58,
      category: "Agriculture",
      headline: "Rain returns to the farm belt",
      body: "Heavy showers ended the dry spell across key growing regions.",
    },
    {
      id: "n-close",
      tick: 84,
      category: "Market",
      headline: "Quantum Motors to give a production timeline at the close",
      body: "The company will publish its battery roadmap when trading ends.",
    },
  ],
  clues: [
    {
      id: "grid-size",
      title: "The grid contract is huge",
      content:
        "A council planning document shows Nova Energy's grid contract is about three times the size the press assumes.",
      confidence: "HIGH",
      hint: "The quiet story can be bigger than the loud one.",
    },
    {
      id: "lab-only",
      title: "Lab only, for now",
      content:
        "A Quantum Motors supplier says the new cells can't be made at scale with any equipment that exists today.",
      confidence: "MEDIUM",
      hint: "A breakthrough in the lab is not a product on the road.",
    },
    {
      id: "ai-real",
      title: "AI demand is real",
      content: "A CloudForge reseller says AI customers are signing year-long contracts, not trials.",
      confidence: "MEDIUM",
      hint: "Long contracts are steadier than one exciting quarter.",
    },
    {
      id: "rain-forecast",
      title: "Rain is on the way",
      content: "A private weather service gives a high chance of heavy rain across the farm belt within days.",
      confidence: "MEDIUM",
      hint: "Forecasts are probabilities, but this one is unusually confident.",
    },
    {
      id: "plant-financing",
      title: "MetroBank to fund the battery plant",
      content: "A trader chat claims MetroBank will finance the giant new battery factory.",
      confidence: "LOW",
      hint: "If the plant is years away, who would lend for it now?",
    },
  ],
  resolution: {
    headline: "Great battery, no factory",
    summary:
      "The battery really works in the lab, but nobody can make it at scale for years. Quantum Motors' roadmap confirmed no production date, and the hype unwound. Nova Energy's grid contract turned out far larger than announced.",
    shock: { QTM: -0.09, NVE: 0.05, CLD: 0.02, AGR: 0.01, MTB: -0.02 },
    explanations: {
      NVE: "The grid contract was about three times the size the market assumed. Most of the gain came late, as details emerged: the quiet, boring news was the real winner.",
      CLD: "AI demand was steady and contracted. CloudForge rose before the usage report, so the headline itself added little.",
      AGR: "Dipped in the dry spell and recovered as the rain moved in. Buying when the weather looked worst paid off; buying on the rain headline was too late.",
      QTM: "Soared on the breakthrough headlines, then fell as experts explained that production was years away. The roadmap confirmed it.",
      MTB: "The plant-financing story was false. MetroBank drifted lower on unrelated worries about interest rates.",
    },
    lessons: [
      "Hype can lift a price long before anything is real. Ask when the product will actually ship.",
      "'Buy the rumor, sell the news': by the time everyone is excited, the easy gains are often gone.",
      "Unglamorous news can matter more than the headline everyone is talking about.",
    ],
  },
};

/** What each clue and headline suggests; used only by the balance simulator. */
export const batteryHypeHints: BalanceHints = {
  clues: {
    "grid-size": { symbol: "NVE", action: "BUY" },
    "lab-only": { symbol: "QTM", action: "AVOID" },
    "ai-real": { symbol: "CLD", action: "BUY" },
    "rain-forecast": { symbol: "AGR", action: "BUY" },
    "plant-financing": { symbol: "MTB", action: "BUY" },
  },
  praises: {
    "n-tease": "QTM",
    "n-range": "QTM",
    "n-ai": "CLD",
    "n-record": "QTM",
    "n-grid": "NVE",
    "n-rain": "AGR",
  },
};
