// Public asset metadata. Safe to ship to the browser: contains no scenario outcomes.
// All money values in the app are integer "cents" (1 credit = 100 cents).

export const ASSET_SYMBOLS = ["NVE", "CLD", "AGR", "QTM", "MTB"] as const;
export type AssetSymbol = (typeof ASSET_SYMBOLS)[number];

export interface AssetInfo {
  symbol: AssetSymbol;
  name: string;
  sector: string;
  sensitivity: string;
  initialPrice: number; // cents
}

export const ASSETS: AssetInfo[] = [
  {
    symbol: "NVE",
    name: "Nova Energy",
    sector: "Energy",
    sensitivity: "Fuel supply, regulation, energy demand",
    initialPrice: 12000,
  },
  {
    symbol: "CLD",
    name: "CloudForge",
    sector: "Technology",
    sensitivity: "Cloud demand, security incidents, contracts",
    initialPrice: 24000,
  },
  {
    symbol: "AGR",
    name: "AgriCore",
    sector: "Agriculture",
    sensitivity: "Weather, fertilizer cost, export policy",
    initialPrice: 6500,
  },
  {
    symbol: "QTM",
    name: "Quantum Motors",
    sector: "Mobility",
    sensitivity: "Battery costs, recalls, consumer demand",
    initialPrice: 18000,
  },
  {
    symbol: "MTB",
    name: "MetroBank",
    sector: "Banking",
    sensitivity: "Interest rates, credit defaults, liquidity",
    initialPrice: 9000,
  },
];

export const ASSET_BY_SYMBOL: Record<AssetSymbol, AssetInfo> = Object.fromEntries(
  ASSETS.map((a) => [a.symbol, a]),
) as Record<AssetSymbol, AssetInfo>;

export function isAssetSymbol(value: string): value is AssetSymbol {
  return (ASSET_SYMBOLS as readonly string[]).includes(value);
}
