export const MARKETS = ["stocks", "options", "futures", "forex", "crypto"] as const;
export const SIDES = ["long", "short"] as const;
export const SESSIONS = ["asia", "london", "newyork", "other"] as const;
export const GRADES = ["A", "B", "C", "F"] as const;

export type Market = (typeof MARKETS)[number];
export type Side = (typeof SIDES)[number];
export type Session = (typeof SESSIONS)[number];
export type Grade = (typeof GRADES)[number];

export type Trade = {
  id: string;
  symbol: string;
  market: Market;
  side: Side;
  openedAt: string;
  closedAt: string;
  entry: number;
  exit: number;
  quantity: number;
  /** Dollars gained/lost per 1.00 price move, per unit of quantity. */
  multiplier: number;
  stop: number | null;
  fees: number;
  setup: string;
  session: Session;
  grade: Grade;
  followedPlan: boolean;
  notes: string;
  tags: string[];
};

const FUTURES_MULTIPLIERS: Record<string, number> = {
  MES: 5,
  ES: 50,
  MNQ: 2,
  NQ: 20,
  MYM: 0.5,
  YM: 5,
  M2K: 5,
  RTY: 50,
  MCL: 100,
  CL: 1000,
  MGC: 10,
  GC: 100,
  SI: 5000,
  HG: 25000,
  NG: 10000,
  ZB: 1000,
  ZN: 1000,
  ZF: 1000,
  "6E": 125000,
  "6B": 62500,
  "6J": 12500000,
};

/**
 * Sensible starting multiplier for a market/symbol. Options are always
 * $100 per point per contract; common futures use their contract point
 * value. Everything else is priced in units, so the multiplier is 1.
 */
export function defaultMultiplier(market: Market, symbol = ""): number {
  if (market === "options") return 100;
  if (market !== "futures") return 1;
  const normalized = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) return 1;
  const keys = Object.keys(FUTURES_MULTIPLIERS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (normalized === key || normalized.startsWith(`${key}1`) || normalized.startsWith(`${key}Z`)) {
      return FUTURES_MULTIPLIERS[key];
    }
    // Contract-month forms such as ESZ26 / NQH26 start with the root symbol.
    if (normalized.startsWith(key) && /[FGHJKMNQUVXZ]\d/.test(normalized.slice(key.length))) {
      return FUTURES_MULTIPLIERS[key];
    }
  }
  return 1;
}

export type Rule = {
  id: string;
  text: string;
};

export type Checks = Record<string, string[]>;

export type JournalBackup = {
  version: 2;
  startingBalance: number;
  trades: Trade[];
  rules: Rule[];
  checks: Checks;
  sampleBanner: boolean;
};

export type JournalView = "overview" | "trades" | "review" | "rules";

export type ResultFilter = "all" | "wins" | "losses" | "offplan";

export type TradeQuery = {
  q: string;
  result: ResultFilter;
  day: string | null;
};
