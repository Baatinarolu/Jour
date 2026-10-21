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
  stop: number | null;
  fees: number;
  setup: string;
  session: Session;
  grade: Grade;
  followedPlan: boolean;
  notes: string;
  tags: string[];
};

export type Rule = {
  id: string;
  text: string;
};

export type Checks = Record<string, string[]>;

export type JournalBackup = {
  version: 1;
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
