import type { BalanceHints, ScenarioConfig } from "./types";

// Server-only: this file contains the hidden truth and must never be imported by the web app.
//
// Hidden truth: the shipping disruption is brief (a backup route already exists).
// Energy spikes on the headline, then gives most of it back. Heavy energy users
// (Quantum Motors) carry the real cost. AgriCore's dip is temporary. The MetroBank
// bad-loan rumor is false.

export const energyShock: ScenarioConfig = {
  id: "energy-shock",
  version: 2,
  name: "The Energy Shock",
  teaser: "Shipping lanes are jammed and everyone is talking about shortages. Is it real?",
  seed: "energy-shock-demo-v1",
  totalTicks: 90,
  noise: 0.004,
  marketNoise: 0.0015,
  // v2 (balance pass): good news now moves prices mostly *before* its headline, so chasing headlines
  // no longer beats acting on a private clue; the shortage spike peaks soon after the headline.
  events: [
    {
      id: "shipping-delay",
      startTick: 4,
      endTick: 14,
      perTick: { NVE: 0.007, QTM: -0.0015, AGR: -0.0025, CLD: -0.0003 },
    },
    { id: "cloud-leak", startTick: 12, endTick: 22, perTick: { CLD: 0.004 } },
    { id: "quiet-relief", startTick: 16, endTick: 44, perTick: { NVE: -0.003, CLD: -0.0003 } },
    { id: "bank-buzz", startTick: 30, endTick: 38, perTick: { MTB: -0.003 } },
    { id: "route-reopens", startTick: 45, endTick: 70, perTick: { NVE: -0.002, AGR: 0.0008 } },
    { id: "bank-stable", startTick: 48, endTick: 70, perTick: { MTB: 0.0012 } },
    { id: "factory-energy", startTick: 62, endTick: 80, perTick: { QTM: -0.0035, NVE: 0.0005 } },
    { id: "harvest-leak", startTick: 55, endTick: 75, perTick: { AGR: 0.003 } },
  ],
  news: [
    {
      id: "n-open",
      tick: 2,
      category: "Market",
      headline: "Markets open calm ahead of a busy session",
      body: "Traders expect a quiet start. Several sector updates are scheduled later today.",
    },
    {
      id: "n-shipping",
      tick: 6,
      category: "Energy",
      headline: "Energy shipments delayed; analysts warn of possible shortages",
      body: "A blocked shipping lane has stalled fuel deliveries. Some analysts warn prices could climb for weeks.",
    },
    {
      id: "n-cloud",
      tick: 22,
      category: "Technology",
      headline: "CloudForge wins government cloud contract",
      body: "CloudForge confirmed a new public-sector deal. Terms were not disclosed.",
    },
    {
      id: "n-bank-buzz",
      tick: 30,
      category: "Banking",
      headline: "Social media buzz questions regional bank health",
      body: "Posts claiming hidden losses at MetroBank are spreading. The bank has not commented yet.",
    },
    {
      id: "n-route",
      tick: 45,
      category: "Energy",
      headline: "Port authority: alternative shipping route now operational",
      body: "Fuel cargo is being rerouted. Officials say deliveries should normalise soon.",
    },
    {
      id: "n-bank-stable",
      tick: 48,
      category: "Banking",
      headline: "MetroBank: loan book stable, liquidity strong",
      body: "MetroBank released an unscheduled update calling the rumors 'baseless'.",
    },
    {
      id: "n-factory",
      tick: 62,
      category: "Mobility",
      headline: "Quantum Motors flags higher factory energy bills",
      body: "The automaker warned that energy costs at its battery plants rose sharply this quarter.",
    },
    {
      id: "n-harvest",
      tick: 75,
      category: "Agriculture",
      headline: "AgriCore harvest estimates revised upward",
      body: "Yields are coming in above forecast despite the transport delays.",
    },
    {
      id: "n-close",
      tick: 84,
      category: "Market",
      headline: "Closing bell approaches; quarterly reports due at the close",
      body: "Final company reports will be released as trading ends. Positions are locked at the bell.",
    },
  ],
  clues: [
    {
      id: "backup-route",
      title: "Backup route secured",
      content:
        "A logistics contact says a backup shipping route has already been secured. The disruption may last only briefly.",
      confidence: "MEDIUM",
      hint: "If the shortage fear fades, energy gains may not hold.",
    },
    {
      id: "energy-exposure",
      title: "Industrial customer exposed",
      content:
        "A supplier invoice suggests a major industrial customer is heavily exposed to higher energy costs.",
      confidence: "MEDIUM",
      hint: "Which company burns the most energy to build its product?",
    },
    {
      id: "strong-harvest",
      title: "Strong harvest",
      content:
        "A farm co-op memo says harvest yields are tracking well above forecast despite the transport delays.",
      confidence: "HIGH",
      hint: "Short-term logistics pain is not the same as long-term supply.",
    },
    {
      id: "bank-rumor",
      title: "Bad-loan whisper",
      content: "A trader chat claims MetroBank is hiding a pile of bad loans.",
      confidence: "LOW",
      hint: "Unverified. Who benefits if you believe it?",
    },
    {
      id: "contract-size",
      title: "Contract is real, but modest",
      content:
        "An industry insider confirms CloudForge's contract is real, but smaller than the headlines will suggest.",
      confidence: "MEDIUM",
      hint: "Good news can already be priced in.",
    },
  ],
  resolution: {
    headline: "The shortage never came",
    summary:
      "The shipping disruption was temporary: a backup route was secured almost immediately. Energy prices spiked on fear, then reversed. The real damage landed on heavy energy users, while the bank rumor turned out to be false.",
    shock: { NVE: -0.05, QTM: -0.05, AGR: 0.03, CLD: 0.03, MTB: 0.03 },
    explanations: {
      NVE: "Spiked on the shortage headline, then gave it all back as word of the backup route spread. Buying after the headline meant buying near the top.",
      CLD: "The contract was real but modest. The upside came before the announcement as word leaked, then faded. Buying on the headline meant buying the top of a small move.",
      AGR: "Fell on transport fears, but the harvest was strong. Informed buyers moved first, so by the time the upgrade was public most of the gain had already happened.",
      QTM: "Quantum Motors was the industrial customer exposed to energy costs. The cost hit was persistent, not temporary.",
      MTB: "The bad-loan rumor was false. The bank's quarterly report was clean, and the stock recovered its brief dip.",
    },
    lessons: [
      "A temporary shock and a persistent change look the same on day one. Ask how long the cause will last.",
      "By the time a headline is public, the move is often priced in. Chasing it is risky.",
      "Private information varies in quality. A low-confidence rumor deserves less weight than a verified memo.",
      "Second-order effects (who pays the higher energy bill?) can matter more than the headline itself.",
    ],
  },
  // Live Newsroom. Effects stay off Nova Energy so the shortage story above plays out unchanged.
  // Clusters: the battery line (launch, then fault) and the drought (warning, then rain).
  newsroom: {
    beats: [
      {
        id: "nr-weather",
        airTick: 3,
        kind: "GENERAL",
        category: "weather",
        headline: "Sunny spells expected along the coast this weekend",
        facts: "Forecasters expect clear skies and light winds through Sunday. Beach towns are preparing for big crowds.",
      },
      {
        id: "nr-marathon",
        airTick: 10,
        kind: "GENERAL",
        category: "sports",
        headline: "City marathon will close central roads on Sunday",
        facts: "Thousands of runners have signed up. Buses will follow diversions until the afternoon.",
      },
      {
        id: "nr-battery-launch",
        airTick: 16,
        kind: "MARKET",
        category: "factory",
        tone: "calm",
        clusterId: "battery-line",
        headline: "Quantum Motors starts its new battery line early",
        facts: "The automaker says its new battery line began production ahead of schedule. More cars are expected to leave the factory this quarter.",
        effects: [{ symbol: "QTM", driftPerTick: 0.004, reactionDelayTicks: 3, durationTicks: 6 }],
      },
      {
        id: "nr-battery-fault",
        airTick: 21,
        kind: "MARKET",
        category: "factory",
        tone: "urgent",
        clusterId: "battery-line",
        headline: "Cooling fault halts the new Quantum Motors battery line",
        facts: "Hours after the launch, a cooling fault stopped the line. Repairs could take a week, and the plant must run on costly backup power meanwhile.",
        effects: [{ symbol: "QTM", driftPerTick: -0.005, reactionDelayTicks: 3, durationTicks: 10 }],
      },
      {
        id: "nr-football",
        airTick: 28,
        kind: "GENERAL",
        category: "sports",
        headline: "Harbor City Hawks reach the regional cup final",
        facts: "The Hawks won their semi-final on penalties. Tickets for the final sold out within an hour.",
      },
      {
        id: "nr-silo-video",
        airTick: 34,
        kind: "NOISE",
        category: "farm",
        tone: "urgent",
        headline: "Viral video claims AgriCore grain silos are empty",
        facts: "A clip shared online appears to show empty silos. AgriCore says the footage is three years old and its stores are full.",
      },
      {
        id: "nr-cloud-north",
        airTick: 40,
        kind: "PRICED_IN",
        category: "tech",
        headline: "CloudForge confirms its northern data centre expansion",
        facts: "CloudForge confirmed the expansion today. Industry blogs had reported the plan for more than a week.",
        effects: [{ symbol: "CLD", driftPerTick: 0.003, reactionDelayTicks: -8, durationTicks: 7 }],
      },
      {
        id: "nr-bank-dividend",
        airTick: 50,
        kind: "MISLEADING",
        category: "bank",
        tone: "urgent",
        headline: "Analyst says MetroBank could double its dividend",
        facts: "A single analyst note predicts MetroBank will double its dividend. The bank has made no announcement.",
        effects: [{ symbol: "MTB", driftPerTick: 0.005, reactionDelayTicks: 1, durationTicks: 8, shape: "SPIKE_REVERT" }],
      },
      {
        id: "nr-festival",
        airTick: 56,
        kind: "GENERAL",
        category: "culture",
        headline: "Record crowds at the Riverside Film Festival",
        facts: "Organisers say the opening night sold out. The festival runs for another week.",
      },
      {
        id: "nr-drought",
        airTick: 63,
        kind: "MARKET",
        category: "farm",
        tone: "urgent",
        clusterId: "drought",
        headline: "Drought warning issued for the southern farm belt",
        facts: "Forecasters warn of weeks without rain in the south. Crop growth could stall, and farm lenders may face late payments.",
        effects: [
          { symbol: "AGR", driftPerTick: -0.004, reactionDelayTicks: 3, durationTicks: 6 },
          { symbol: "MTB", driftPerTick: -0.0015, reactionDelayTicks: 4, durationTicks: 5 },
        ],
      },
      {
        id: "nr-rain",
        airTick: 68,
        kind: "MARKET",
        category: "weather",
        clusterId: "drought",
        headline: "Forecast flips as heavy rain heads for the southern farm belt",
        facts: "A new forecast shows heavy rain arriving within days, and the drought warning has been lifted. Farmers say reservoirs are already close to full.",
        effects: [
          { symbol: "AGR", driftPerTick: 0.005, reactionDelayTicks: 2, durationTicks: 8, shape: "RAMP" },
          { symbol: "MTB", driftPerTick: 0.0015, reactionDelayTicks: 3, durationTicks: 5 },
        ],
      },
      {
        id: "nr-comet",
        airTick: 78,
        kind: "GENERAL",
        category: "world",
        headline: "Astronomers say a bright comet is visible after sunset",
        facts: "The comet will be easiest to see from dark parks outside the city later this week.",
      },
    ],
  },
};

/** What each clue and headline suggests; used only by the balance simulator. */
export const energyShockHints: BalanceHints = {
  clues: {
    "backup-route": { symbol: "NVE", action: "AVOID" },
    "energy-exposure": { symbol: "QTM", action: "AVOID" },
    "strong-harvest": { symbol: "AGR", action: "BUY" },
    "bank-rumor": { symbol: "MTB", action: "AVOID" },
    "contract-size": { symbol: "CLD", action: "BUY" },
  },
  praises: {
    "n-shipping": "NVE",
    "n-cloud": "CLD",
    "n-bank-stable": "MTB",
    "n-harvest": "AGR",
  },
};
