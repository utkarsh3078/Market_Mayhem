import type { ScenarioConfig } from "./types";

// Server-only: this file contains the hidden truth and must never be imported by the web app.
//
// Hidden truth: the shipping disruption is brief (a backup route already exists).
// Energy spikes on the headline, then gives most of it back. Heavy energy users
// (Quantum Motors) carry the real cost. AgriCore's dip is temporary. The MetroBank
// bad-loan rumor is false.

export const energyShock: ScenarioConfig = {
  id: "energy-shock",
  version: 1,
  name: "The Energy Shock",
  teaser: "Shipping lanes are jammed and everyone is talking about shortages. Is it real?",
  seed: "energy-shock-demo-v1",
  totalTicks: 90,
  noise: 0.004,
  marketNoise: 0.0015,
  events: [
    {
      id: "shipping-delay",
      startTick: 6,
      endTick: 40,
      perTick: { NVE: 0.006, QTM: -0.0015, AGR: -0.0025, CLD: -0.0003 },
    },
    { id: "cloud-contract", startTick: 22, endTick: 34, perTick: { CLD: 0.004 } },
    { id: "bank-buzz", startTick: 30, endTick: 38, perTick: { MTB: -0.003 } },
    { id: "route-reopens", startTick: 45, endTick: 70, perTick: { NVE: -0.0045, AGR: 0.0008 } },
    { id: "bank-stable", startTick: 48, endTick: 70, perTick: { MTB: 0.0012 } },
    { id: "factory-energy", startTick: 62, endTick: 80, perTick: { QTM: -0.0035, NVE: 0.0005 } },
    { id: "harvest-upgrade", startTick: 75, endTick: 90, perTick: { AGR: 0.003 } },
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
    shock: { NVE: -0.07, QTM: -0.05, AGR: 0.06, CLD: 0.02, MTB: 0.03 },
    explanations: {
      NVE: "Rallied hard on the shortage headline, then gave most of it back once the backup route was public. Buying after the headline meant buying near the top.",
      CLD: "The contract was real but modest. Most of the upside arrived with the headline; the final report confirmed only a small gain.",
      AGR: "Fell on transport fears, but the harvest was strong. Players who looked past the short-term headline bought the dip.",
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
};
