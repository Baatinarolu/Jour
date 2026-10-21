import { format } from "date-fns";
import { dayKey, moneyRound } from "./format.ts";
import type { Checks, Rule, Trade } from "./types.ts";

export type TradeCore = Omit<
  Pick<Trade, "side" | "entry" | "exit" | "quantity" | "multiplier" | "fees" | "stop">,
  "multiplier"
> & { multiplier?: number };

/** Legacy trades (pre-multiplier localStorage/backups) priced size in dollars per point. */
export function multiplierOf(t: TradeCore): number {
  return t.multiplier != null && Number.isFinite(t.multiplier) && t.multiplier > 0 ? t.multiplier : 1;
}

export function tradePnl(t: TradeCore): number {
  const diff = t.side === "long" ? t.exit - t.entry : t.entry - t.exit;
  return moneyRound(diff * t.quantity * multiplierOf(t) - t.fees);
}

export function tradeRisk(t: TradeCore): number | null {
  if (t.stop == null || !Number.isFinite(t.stop)) return null;
  // A stop on the profit side is a data error, not risk: no R.
  if (t.side === "long" && t.stop >= t.entry) return null;
  if (t.side === "short" && t.stop <= t.entry) return null;
  const dist = Math.abs(t.entry - t.stop);
  if (dist === 0) return null;
  return moneyRound(dist * t.quantity * multiplierOf(t));
}

export function tradeR(t: TradeCore): number | null {
  const risk = tradeRisk(t);
  if (risk == null || risk === 0) return null;
  return tradePnl(t) / risk;
}

export type EquityPoint = {
  key: string;
  label: string;
  equity: number;
  dayPnl: number;
};

export function buildEquity(trades: Trade[], start: number): EquityPoint[] {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
  );
  const days: { key: string; label: string; pnl: number }[] = [];
  for (const t of sorted) {
    const key = dayKey(t.closedAt);
    const last = days[days.length - 1];
    const pnl = tradePnl(t);
    if (last && last.key === key) last.pnl = moneyRound(last.pnl + pnl);
    else days.push({ key, label: format(new Date(t.closedAt), "MMM d"), pnl });
  }
  let equity = moneyRound(start);
  const points: EquityPoint[] = [];
  if (days.length) {
    const first = new Date(`${days[0].key}T12:00:00`);
    first.setDate(first.getDate() - 1);
    points.push({
      key: "start",
      label: format(first, "MMM d"),
      equity,
      dayPnl: 0,
    });
  }
  for (const day of days) {
    equity = moneyRound(equity + day.pnl);
    points.push({ key: day.key, label: day.label, equity, dayPnl: day.pnl });
  }
  return points;
}

export type Streak = { kind: "win" | "loss" | "none"; count: number };

export type JournalStats = {
  count: number;
  wins: number;
  losses: number;
  scratches: number;
  net: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgR: number | null;
  payoff: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  streak: Streak;
  firstAt: string | null;
  lastAt: string | null;
};

export function journalStats(trades: Trade[], startingBalance: number): JournalStats {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
  );
  let net = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let scratches = 0;
  let winSum = 0;
  let lossSum = 0;
  let rSum = 0;
  let rCount = 0;

  for (const t of sorted) {
    const pnl = tradePnl(t);
    net = moneyRound(net + pnl);
    if (pnl > 0) {
      wins += 1;
      winSum += pnl;
      grossProfit = moneyRound(grossProfit + pnl);
    } else if (pnl < 0) {
      losses += 1;
      lossSum += pnl;
      grossLoss = moneyRound(grossLoss + pnl);
    } else {
      scratches += 1;
    }
    const r = tradeR(t);
    if (r != null && Number.isFinite(r)) {
      rSum += r;
      rCount += 1;
    }
  }

  const decisive = wins + losses;
  const avgWin = wins ? moneyRound(winSum / wins) : null;
  const avgLoss = losses ? moneyRound(lossSum / losses) : null;
  const lossAbs = Math.abs(grossLoss);

  const curve = buildEquity(sorted, startingBalance);
  let peak = moneyRound(startingBalance);
  let maxDrawdown = 0;
  let maxDrawdownPct: number | null = null;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    const dd = moneyRound(peak - point.equity);
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct ?? 0, dd / peak);
  }

  let streak: Streak = { kind: "none", count: 0 };
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const pnl = tradePnl(sorted[i]);
    const kind = pnl > 0 ? "win" : pnl < 0 ? "loss" : null;
    if (!kind) continue;
    if (streak.kind === "none") streak = { kind, count: 1 };
    else if (streak.kind === kind) streak = { kind, count: streak.count + 1 };
    else break;
  }

  return {
    count: trades.length,
    wins,
    losses,
    scratches,
    net,
    grossProfit,
    grossLoss,
    winRate: decisive ? wins / decisive : null,
    profitFactor: lossAbs === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : null) : grossProfit / lossAbs,
    expectancy: trades.length ? moneyRound(net / trades.length) : null,
    avgWin,
    avgLoss,
    avgR: rCount ? rSum / rCount : null,
    payoff: avgWin != null && avgLoss != null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null,
    maxDrawdown,
    maxDrawdownPct,
    streak,
    firstAt: sorted[0]?.closedAt ?? null,
    lastAt: sorted[sorted.length - 1]?.closedAt ?? null,
  };
}

export type GroupStat = {
  key: string;
  net: number;
  count: number;
  wins: number;
  winRate: number | null;
  totalR: number;
  avgR: number | null;
  rCount: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
};

function summarizeGroup(key: string, list: readonly Trade[]): GroupStat {
  let net = 0;
  let wins = 0;
  let decisive = 0;
  let totalR = 0;
  let rCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  for (const t of list) {
    const pnl = tradePnl(t);
    net += pnl;
    if (pnl > 0) {
      wins += 1;
      decisive += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      decisive += 1;
      grossLoss += pnl;
    }
    const r = tradeR(t);
    if (r != null && Number.isFinite(r)) {
      totalR += r;
      rCount += 1;
    }
  }
  const lossAbs = Math.abs(grossLoss);
  return {
    key,
    net: moneyRound(net),
    count: list.length,
    wins,
    winRate: decisive ? wins / decisive : null,
    totalR,
    avgR: rCount ? totalR / rCount : null,
    rCount,
    grossProfit: moneyRound(grossProfit),
    grossLoss: moneyRound(grossLoss),
    profitFactor: lossAbs === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : null) : grossProfit / lossAbs,
  };
}

export function groupTrades(trades: Trade[], keyOf: (t: Trade) => string): GroupStat[] {
  const map = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = keyOf(t);
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return [...map.entries()].map(([key, list]) => summarizeGroup(key, list));
}

/**
 * One row per tag. A trade counts (in full) under every tag it carries,
 * so tag totals intentionally do not sum to the journal total.
 */
export function tagGroups(trades: Trade[]): GroupStat[] {
  const map = new Map<string, Trade[]>();
  for (const trade of trades) {
    const tags = new Set(trade.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
    for (const tag of tags) {
      const list = map.get(tag);
      if (list) list.push(trade);
      else map.set(tag, [trade]);
    }
  }
  return [...map.entries()]
    .map(([key, list]) => summarizeGroup(key, list))
    .sort((a, b) => a.net - b.net);
}

export type RuleHistoryDay = {
  date: string;
  honored: number;
  total: number;
  ratio: number | null;
};

/** Daily rule adherence for the trailing `days`, oldest first, ending today. */
export function ruleHistory(
  checks: Checks,
  rules: readonly Rule[],
  days = 14,
  today: Date = new Date(),
): RuleHistoryDay[] {
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const end = new Date(today);
  end.setHours(12, 0, 0, 0);
  const result: RuleHistoryDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - offset);
    const key = format(date, "yyyy-MM-dd");
    const honored = (checks[key] ?? []).filter((id) => ruleIds.has(id)).length;
    result.push({
      date: key,
      honored,
      total: rules.length,
      ratio: rules.length ? honored / rules.length : null,
    });
  }
  return result;
}

export function planSplit(trades: Trade[]): { on: GroupStat; off: GroupStat } {
  const groups = groupTrades(trades, (t) => (t.followedPlan ? "on" : "off"));
  const empty = (key: string): GroupStat => ({
    key,
    net: 0,
    count: 0,
    wins: 0,
    winRate: null,
    totalR: 0,
    avgR: null,
    rCount: 0,
    grossProfit: 0,
    grossLoss: 0,
    profitFactor: null,
  });
  return {
    on: groups.find((g) => g.key === "on") ?? empty("on"),
    off: groups.find((g) => g.key === "off") ?? empty("off"),
  };
}

export function matchesQuery(
  t: Trade,
  query: { q: string; result: "all" | "wins" | "losses" | "offplan" | "breakeven" | "unreviewed"; day: string | null },
): boolean {
  if (query.day && dayKey(t.closedAt) !== query.day) return false;
  const pnl = tradePnl(t);
  if (query.result === "wins" && pnl <= 0) return false;
  if (query.result === "losses" && pnl >= 0) return false;
  if (query.result === "breakeven" && pnl !== 0) return false;
  if (query.result === "offplan" && t.followedPlan) return false;
  if (
    query.result === "unreviewed" &&
    Boolean(t.lesson?.trim() || t.notes.trim()) &&
    Boolean(t.entryEmotion) &&
    Boolean(t.screenshots?.length)
  ) {
    return false;
  }
  const q = query.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    t.symbol,
    t.setup,
    t.notes,
    t.market,
    t.side,
    t.timeframe ?? "",
    t.entryEmotion ?? "",
    t.exitEmotion ?? "",
    t.mistake ?? "",
    t.lesson ?? "",
    t.entryReason ?? "",
    t.exitReason ?? "",
    t.voiceNote ?? "",
    t.account ?? "",
    t.tvSymbol ?? "",
    ...t.tags,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function tradeDurationMinutes(t: Pick<Trade, "openedAt" | "closedAt">): number | null {
  const start = Date.parse(t.openedAt);
  const end = Date.parse(t.closedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 60000;
}

export type PerformanceMode = "money" | "r" | "pct";

export type PerformancePoint = EquityPoint & { value: number; dayValue: number };

/** Daily performance series in account currency, cumulative R, or return on starting balance. */
export function buildPerformanceSeries(
  trades: Trade[],
  start: number,
  mode: PerformanceMode,
): PerformancePoint[] {
  const equityPoints = buildEquity(trades, start);
  if (mode === "money") {
    return equityPoints.map((point) => ({ ...point, value: point.equity, dayValue: point.dayPnl }));
  }

  const byDay = new Map<string, { pnl: number; r: number }>();
  for (const trade of trades) {
    const key = dayKey(trade.closedAt);
    const current = byDay.get(key) ?? { pnl: 0, r: 0 };
    current.pnl = moneyRound(current.pnl + tradePnl(trade));
    current.r += tradeR(trade) ?? 0;
    byDay.set(key, current);
  }

  let cumulativeR = 0;
  return equityPoints.map((point) => {
    if (point.key === "start") return { ...point, value: 0, dayValue: 0 };
    const day = byDay.get(point.key) ?? { pnl: point.dayPnl, r: 0 };
    cumulativeR += day.r;
    const value = mode === "r" ? cumulativeR : start > 0 ? (point.equity - start) / start : 0;
    const dayValue = mode === "r" ? day.r : start > 0 ? day.pnl / start : 0;
    return { ...point, value, dayValue };
  });
}

/** Stable identity for suppressing duplicate CSV re-imports. */
export function tradeFingerprint(t: Trade): string {
  return [
    t.externalId?.trim().toLowerCase() ?? "",
    t.account?.trim().toLowerCase() ?? "",
    t.symbol.trim().toUpperCase(),
    t.side,
    t.openedAt,
    t.closedAt,
    t.entry,
    t.exit,
    t.quantity,
    t.multiplier,
  ].join("|");
}

export function excursionR(t: Trade): { maeR: number | null; mfeR: number | null } {
  const risk = tradeRisk(t);
  if (risk == null || risk === 0) return { maeR: null, mfeR: null };
  const unitRisk = risk / (t.quantity * multiplierOf(t));
  if (!Number.isFinite(unitRisk) || unitRisk <= 0) return { maeR: null, mfeR: null };
  const maeR = t.mae == null ? null : (t.side === "long" ? t.entry - t.mae : t.mae - t.entry) / unitRisk;
  const mfeR = t.mfe == null ? null : (t.side === "long" ? t.mfe - t.entry : t.entry - t.mfe) / unitRisk;
  return { maeR, mfeR };
}
