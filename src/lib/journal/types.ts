export const MARKETS = [
  "stocks",
  "options",
  "futures",
  "forex",
  "crypto",
  "indices",
  "commodities",
  "metals",
] as const;
export const SIDES = ["long", "short"] as const;
export const SESSIONS = ["asia", "london", "overlap", "newyork", "other"] as const;
export const GRADES = ["A+", "A", "B", "C", "D", "F"] as const;
export const EMOTIONS = [
  "calm",
  "focused",
  "confident",
  "neutral",
  "anxious",
  "fearful",
  "fomo",
  "frustrated",
  "revenge",
  "bored",
  "tired",
  "euphoric",
] as const;
export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"] as const;

export type Market = (typeof MARKETS)[number];
export type Side = (typeof SIDES)[number];
export type Session = (typeof SESSIONS)[number];
export type Grade = (typeof GRADES)[number];
export type Emotion = (typeof EMOTIONS)[number];
export type TradeSource = "manual" | "csv" | "sample";

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

  /** Rich journal fields. Optional so older local journals keep working. */
  account?: string;
  playbookId?: string | null;
  target?: number | null;
  timeframe?: string;
  /** Optional exchange-qualified TradingView symbol, e.g. NASDAQ:NVDA. */
  tvSymbol?: string;
  entryEmotion?: Emotion;
  exitEmotion?: Emotion;
  confidence?: number;
  mistake?: string;
  lesson?: string;
  entryReason?: string;
  exitReason?: string;
  screenshots?: string[];
  voiceNote?: string;
  criteriaChecked?: string[];
  /** Lowest / highest favorable prices reached, when the trader records them. */
  mae?: number | null;
  mfe?: number | null;
  source?: TradeSource;
  externalId?: string;
  createdAt?: string;
  updatedAt?: string;
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

/** A documented setup used to make “followed the plan” measurable. */
export type Playbook = {
  id: string;
  name: string;
  description: string;
  markets: Market[];
  sessions: Session[];
  timeframes: string[];
  entryCriteria: string[];
  invalidation: string;
  managementRules: string[];
  notes: string;
  /** One optional example image, stored locally as a data URL. */
  exampleScreenshot: string;
  createdAt: string;
  updatedAt: string;
};

/** One trading day's pre-market plan and end-of-day review. */
export type DayEntry = {
  /** Local calendar date in YYYY-MM-DD form. */
  date: string;
  planFocus: string;
  planBias: string;
  planNotes: string;
  allowedPlaybookIds: string[];
  /** Optional maximum planned loss for the day, expressed in R. */
  maxLossR: number | null;
  /** Optional 1–5 self-rating recorded before trading. */
  readiness?: number;
  reviewWentWell: string;
  reviewMistakes: string;
  reviewLesson: string;
  reviewNotes: string;
  followedPlan?: boolean;
  dayGrade?: Grade;
  createdAt: string;
  updatedAt: string;
};

export type DayEntries = Record<string, DayEntry>;

/** Point-in-time statistics preserved with a guided weekly review. */
export type WeeklyReviewSnapshot = {
  trades: number;
  net: number;
  totalR: number;
  winRate: number | null;
  avgR: number | null;
  profitFactor: number | null;
  planRate: number | null;
};

/** A trader-written review for one Monday–Sunday week. */
export type WeeklyReview = {
  id: string;
  weekStart: string;
  weekEnd: string;
  keptDoing: string;
  stopDoing: string;
  bestTrade: string;
  worstTrade: string;
  biggestLesson: string;
  nextFocus: string;
  notes: string;
  snapshot: WeeklyReviewSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type JournalBackup = {
  version: 4;
  startingBalance: number;
  trades: Trade[];
  rules: Rule[];
  checks: Checks;
  sampleBanner: boolean;
  playbooks: Playbook[];
  activePlaybookId: string | null;
  dayEntries: DayEntries;
  weeklyReviews: WeeklyReview[];
};

export type JournalView = "overview" | "daily" | "trades" | "chart" | "review" | "rules";

export type ResultFilter = "all" | "wins" | "losses" | "offplan" | "breakeven" | "unreviewed";

export type TradeQuery = {
  q: string;
  result: ResultFilter;
  day: string | null;
};
