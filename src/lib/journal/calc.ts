import { format } from "date-fns";
import { dayKey, moneyRound } from "./format";
import type { Trade } from "./types";

export type TradeCore = Pick<Trade, "side" | "entry" | "exit" | "quantity" | "fees" | "stop">;

export function tradePnl(t: TradeCore): number {
  const diff = t.side === "long" ? t.exit - t.entry : t.entry - t.exit;
  return moneyRound(diff * t.quantity - t.fees);
}

export function tradeRisk(t: TradeCore): number | null {
  if (t.stop == null || !Number.isFinite(t.stop)) return null;
  const dist = Math.abs(t.entry - t.stop);
  if (dist === 0) return null;
  return moneyRound(dist * t.quantity);
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
  let maxDrawdownPct = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    const dd = moneyRound(peak - point.equity);
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, dd / peak);
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
    maxDrawdownPct: curve.length ? maxDrawdownPct : null,
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
};

export function groupTrades(trades: Trade[], keyOf: (t: Trade) => string): GroupStat[] {
  const map = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = keyOf(t);
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return [...map.entries()].map(([key, list]) => {
    let net = 0;
    let wins = 0;
    let decisive = 0;
    for (const t of list) {
      const pnl = tradePnl(t);
      net += pnl;
      if (pnl > 0) {
        wins += 1;
        decisive += 1;
      } else if (pnl < 0) decisive += 1;
    }
    return {
      key,
      net: moneyRound(net),
      count: list.length,
      wins,
      winRate: decisive ? wins / decisive : null,
    };
  });
}

export function planSplit(trades: Trade[]): { on: GroupStat; off: GroupStat } {
  const groups = groupTrades(trades, (t) => (t.followedPlan ? "on" : "off"));
  const empty = (key: string): GroupStat => ({
    key,
    net: 0,
    count: 0,
    wins: 0,
    winRate: null,
  });
  return {
    on: groups.find((g) => g.key === "on") ?? empty("on"),
    off: groups.find((g) => g.key === "off") ?? empty("off"),
  };
}

export function matchesQuery(
  t: Trade,
  query: { q: string; result: "all" | "wins" | "losses" | "offplan"; day: string | null },
): boolean {
  if (query.day && dayKey(t.closedAt) !== query.day) return false;
  const pnl = tradePnl(t);
  if (query.result === "wins" && pnl <= 0) return false;
  if (query.result === "losses" && pnl >= 0) return false;
  if (query.result === "offplan" && t.followedPlan) return false;
  const q = query.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [t.symbol, t.setup, t.notes, t.market, t.side, ...t.tags].join(" ").toLowerCase();
  return hay.includes(q);
}
