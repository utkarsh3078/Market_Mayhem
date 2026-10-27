import type { BalanceHints, ScenarioConfig } from "./types";

// Server-only: this file contains the hidden truth and must never be imported by the web app.
//
// Hidden truth: CloudForge's "breach" is tiny and contained within hours. The real story is a rival
// provider's long outage, which sends customers to CloudForge. The panic spills briefly into banks,
// which have no real exposure. The Quantum Motors recall rumor is false.

export const cloudBreach: ScenarioConfig = {
  id: "cloud-breach",
  version: 1,
  name: "The Cloud Breach",
  teaser: "CloudForge just reported a security incident and the headlines are terrifying. How bad is it really?",
  seed: "cloud-breach-demo-v1",
  totalTicks: 90,
  noise: 0.004,
  marketNoise: 0.0015,
  events: [
    { id: "breach-panic", startTick: 8, endTick: 24, perTick: { CLD: -0.006 } },
    { id: "insiders-calm", startTick: 24, endTick: 40, perTick: { CLD: 0.0055 } },
    { id: "rival-outage", startTick: 56, endTick: 84, perTick: { CLD: 0.0035 } },
    { id: "bank-cyber-fear", startTick: 12, endTick: 26, perTick: { MTB: -0.0025 } },
    { id: "bank-relief", startTick: 34, endTick: 56, perTick: { MTB: 0.003 } },
    { id: "data-centre-power", startTick: 20, endTick: 64, perTick: { NVE: 0.0022 } },
    { id: "ev-launch-hype", startTick: 44, endTick: 60, perTick: { QTM: 0.003 } },
    { id: "after-launch", startTick: 60, endTick: 84, perTick: { QTM: -0.0012, AGR: -0.0018 } },
  ],
  news: [
    {
      id: "n-open",
      tick: 3,
      category: "Market",
      headline: "Tech sector opens flat in a quiet session",
      body: "Volumes are light. Few company updates are expected this morning.",
    },
    {
      id: "n-incident",
      tick: 8,
      category: "Technology",
      headline: "CloudForge reports a security incident",
      body: "The company confirmed unauthorised access to part of its systems and says it is investigating.",
    },
    {
      id: "n-banks",
      tick: 13,
      category: "Banking",
      headline: "Banks review cyber exposure after cloud incident",
      body: "Several lenders, including MetroBank, say they are checking their own systems.",
    },
    {
      id: "n-catastrophic",
      tick: 18,
      category: "Technology",
      headline: "Commentator warns breach could be 'catastrophic'",
      body: "A television pundit predicts mass customer losses. No new facts were given.",
    },
    {
      id: "n-contained",
      tick: 32,
      category: "Technology",
      headline: "CloudForge: incident contained, no customer data lost",
      body: "An independent review found the access was limited to a single test server.",
    },
    {
      id: "n-recall",
      tick: 42,
      category: "Mobility",
      headline: "Unverified posts claim a Quantum Motors recall",
      body: "Screenshots of an alleged recall notice are circulating. The company has not responded.",
    },
    {
      id: "n-outage",
      tick: 56,
      category: "Technology",
      headline: "Rival cloud provider suffers a multi-hour outage",
      body: "Thousands of businesses went offline. Several say they are looking for a new provider.",
    },
    {
      id: "n-model",
      tick: 61,
      category: "Mobility",
      headline: "Quantum Motors unveils a new compact EV",
      body: "Pre-orders opened today at a lower price than analysts expected.",
    },
    {
      id: "n-fertilizer",
      tick: 70,
      category: "Agriculture",
      headline: "Fertilizer prices tick higher",
      body: "Farm input costs rose for the third week running.",
    },
    {
      id: "n-close",
      tick: 84,
      category: "Market",
      headline: "CloudForge to publish its incident report at the close",
      body: "The final review will be released as trading ends.",
    },
  ],
  clues: [
    {
      id: "breach-scope",
      title: "The breach is tiny",
      content:
        "A security engineer involved in the response says only one isolated test server was touched. Customer systems were never reached.",
      confidence: "HIGH",
      hint: "Fear moves faster than facts. What happens when the facts arrive?",
    },
    {
      id: "no-exposure",
      title: "No real bank exposure",
      content: "A MetroBank IT contractor says the bank doesn't run anything critical on CloudForge.",
      confidence: "MEDIUM",
      hint: "Being in the same headline is not the same as being affected.",
    },
    {
      id: "recall-whisper",
      title: "Recall is coming",
      content: "A forum user claims a Quantum Motors recall notice will be issued this week.",
      confidence: "LOW",
      hint: "A screenshot is easy to fake. Is there any second source?",
    },
    {
      id: "power-hungry",
      title: "Data centres want more power",
      content: "A utility planner says data-centre electricity orders to Nova Energy are climbing fast.",
      confidence: "MEDIUM",
      hint: "Cloud growth needs electricity, whoever wins the customers.",
    },
    {
      id: "input-costs",
      title: "Farm costs are rising",
      content: "A supplier price list shows fertilizer for AgriCore's growers rising again next month.",
      confidence: "MEDIUM",
      hint: "Rising costs squeeze margins quietly, without any dramatic headline.",
    },
  ],
  resolution: {
    headline: "A scare, not a disaster",
    summary:
      "CloudForge's breach touched a single test server and was contained within hours. Days later a rival's long outage sent customers looking for a more reliable provider, and CloudForge was the obvious choice. The recall rumor was false.",
    shock: { CLD: 0.08, MTB: 0.02, NVE: 0.02, QTM: 0.01, AGR: -0.03 },
    explanations: {
      NVE: "Data centres run on electricity. Growing cloud demand meant more power orders, whichever provider won the customers.",
      CLD: "Sold off hard on the scary headlines, then recovered as insiders learned the incident was tiny, before the official all-clear. It then gained customers after the rival's outage.",
      AGR: "Quietly hurt by rising fertilizer costs. No dramatic news, just a slow squeeze on margins.",
      QTM: "The recall rumor was fake. The stock rose ahead of the new EV launch, then slipped once it was official: the good news was already in the price.",
      MTB: "Dipped on fear by association, then recovered. The bank had no meaningful exposure to CloudForge.",
    },
    lessons: [
      "Scary headlines move prices before the facts arrive. Ask how big the problem actually is.",
      "Being mentioned in a crisis is not the same as being affected by it.",
      "One company's bad day can be another's opportunity: watch what customers do next.",
    ],
  },
};

/** What each clue and headline suggests; used only by the balance simulator. */
export const cloudBreachHints: BalanceHints = {
  clues: {
    "breach-scope": { symbol: "CLD", action: "BUY" },
    "no-exposure": { symbol: "MTB", action: "BUY" },
    "recall-whisper": { symbol: "QTM", action: "AVOID" },
    "power-hungry": { symbol: "NVE", action: "BUY" },
    "input-costs": { symbol: "AGR", action: "AVOID" },
  },
  praises: {
    "n-contained": "CLD",
    "n-model": "QTM",
  },
};
