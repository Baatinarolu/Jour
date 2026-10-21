import { groupTrades, journalStats, tradeDurationMinutes, tradePnl, tradeR, type GroupStat } from "./calc.ts";
import { dayKey, emotionLabel, formatMoney, formatPct, formatR, moneyRound, sessionLabel } from "./format.ts";
import type { Playbook, Trade } from "./types.ts";

export type RangeFilter = "today" | "week" | "14d" | "30d" | "90d" | "all";

export function filterTradesByRange(trades: readonly Trade[], range: RangeFilter, now = new Date()): Trade[] {
  if (range === "all") return [...trades];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else if (range === "14d") start.setDate(start.getDate() - 13);
  else if (range === "30d") start.setDate(start.getDate() - 29);
  else if (range === "90d") start.setDate(start.getDate() - 89);
  return trades.filter((trade) => Date.parse(trade.closedAt) >= start.getTime());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type SizingResult = {
  valid: boolean;
  riskBudget: number;
  stopDistance: number;
  quantity: number;
  risk: number;
  message: string;
};

/** Position-size helper for completing the journal ticket: risk ÷ stop distance. */
export function calculateQuantity(input: {
  balance: number;
  riskPct: number;
  entry: number;
  stop: number;
  multiplier: number;
}): SizingResult {
  const riskBudget = input.balance > 0 && input.riskPct > 0 ? (input.balance * input.riskPct) / 100 : 0;
  const stopDistance = Math.abs(input.entry - input.stop);
  if (!Number.isFinite(input.entry) || !Number.isFinite(input.stop) || stopDistance <= 0 || input.multiplier <= 0) {
    return { valid: false, riskBudget, stopDistance, quantity: 0, risk: 0, message: "Entry, stop and multiplier must define a real stop distance." };
  }
  if (riskBudget <= 0) {
    return { valid: false, riskBudget, stopDistance, quantity: 0, risk: 0, message: "Set an account balance and a risk percentage above zero." };
  }
  const quantity = Math.floor((riskBudget / (stopDistance * input.multiplier)) * 10000) / 10000;
  if (quantity <= 0) {
    return { valid: false, riskBudget, stopDistance, quantity: 0, risk: 0, message: "The risk budget is too small for this stop and contract value." };
  }
  return {
    valid: true,
    riskBudget: moneyRound(riskBudget),
    stopDistance,
    quantity,
    risk: moneyRound(stopDistance * quantity * input.multiplier),
    message: "Rounded down before fees and slippage, so planned risk stays inside the budget.",
  };
}

export type JournalScore = {
  score: number;
  label: string;
  sampleFactor: number;
  components: { key: string; label: string; score: number; max: number; detail: string }[];
};

/**
 * A transparent local score for journal quality and trading process.
 * It is a review aid, not a prediction or trading signal.
 */
export function santandcScore(trades: readonly Trade[], startingBalance: number): JournalScore {
  const stats = journalStats([...trades], startingBalance);
  const sampleFactor = clamp(trades.length / 50, 0, 1);
  if (!trades.length) {
    return {
      score: 0,
      label: "No sample yet",
      sampleFactor,
      components: [
        { key: "performance", label: "Performance", score: 0, max: 30, detail: "Log trades to begin." },
        { key: "discipline", label: "Discipline", score: 0, max: 35, detail: "Plan adherence has no sample." },
        { key: "journal", label: "Journal depth", score: 0, max: 20, detail: "No reviewed trades yet." },
        { key: "risk", label: "Risk control", score: 0, max: 15, detail: "No defined-risk trades yet." },
      ],
    };
  }

  const avgRScore = stats.avgR == null ? 8 : clamp(((stats.avgR + 0.5) / 1.25) * 20, 0, 20);
  const pf = stats.profitFactor == null ? 0 : Number.isFinite(stats.profitFactor) ? stats.profitFactor : 2.5;
  const performance = avgRScore + clamp((pf / 2.5) * 10, 0, 10);

  const planRate = trades.filter((trade) => trade.followedPlan).length / trades.length;
  const stopRate = trades.filter((trade) => trade.stop != null).length / trades.length;
  const discipline = clamp(planRate * 25 + stopRate * 10, 0, 35);

  const byDay = new Map<string, number>();
  for (const trade of trades) byDay.set(dayKey(trade.closedAt), (byDay.get(dayKey(trade.closedAt)) ?? 0) + tradePnl(trade));
  const greenRate = byDay.size ? [...byDay.values()].filter((value) => value > 0).length / byDay.size : 0;
  const reviewedRate = trades.filter((trade) => trade.lesson?.trim() || trade.notes.trim()).length / trades.length;
  const emotionRate = trades.filter((trade) => trade.entryEmotion && trade.exitEmotion).length / trades.length;
  const screenshotRate = trades.filter((trade) => trade.screenshots?.length).length / trades.length;
  const journalDepth = clamp(reviewedRate * 8 + emotionRate * 6 + screenshotRate * 6, 0, 20);

  const rValues = trades.map(tradeR).filter((value): value is number => value != null && Number.isFinite(value));
  const tailRate = rValues.length ? rValues.filter((value) => value < -1.2).length / rValues.length : 0;
  const risk = clamp((rValues.length ? (1 - tailRate) * 9 : 3) + greenRate * 6, 0, 15);

  const raw = performance + discipline + journalDepth + risk;
  const score = Math.round(clamp(raw * (0.65 + 0.35 * sampleFactor), 0, 100));
  const label = trades.length < 10 ? "Early sample" : score >= 80 ? "Strong process" : score >= 65 ? "Building edge" : score >= 50 ? "Mixed execution" : score >= 35 ? "Leaks dominating" : "Needs repair";

  return {
    score,
    label,
    sampleFactor,
    components: [
      { key: "performance", label: "Performance", score: Math.round(performance), max: 30, detail: `${formatR(stats.avgR)} avg R · ${stats.profitFactor == null ? "—" : Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"} profit factor` },
      { key: "discipline", label: "Discipline", score: Math.round(discipline), max: 35, detail: `${formatPct(planRate)} on plan · ${formatPct(stopRate)} with stops` },
      { key: "journal", label: "Journal depth", score: Math.round(journalDepth), max: 20, detail: `${formatPct(reviewedRate)} reviewed · ${formatPct(emotionRate)} emotion-tagged · ${formatPct(screenshotRate)} with charts` },
      { key: "risk", label: "Risk control", score: Math.round(risk), max: 15, detail: `${formatPct(tailRate)} lost more than 1.2R · ${formatPct(greenRate)} green days` },
    ],
  };
}

export type LeakFinding = GroupStat & {
  dimension: string;
  tradeIds: string[];
  severity: number;
  action: string;
};

function durationBucket(trade: Trade): string {
  const minutes = tradeDurationMinutes(trade);
  if (minutes == null) return "Unknown";
  if (minutes < 15) return "Under 15m";
  if (minutes < 60) return "15–60m";
  if (minutes < 240) return "1–4h";
  if (minutes < 1440) return "4–24h";
  return "Over 1d";
}

function leakAction(dimension: string, key: string): string {
  if (dimension.includes("emotion")) return `Treat “${key}” as a pause trigger: re-check every playbook criterion before the next entry.`;
  if (dimension.includes("Session")) return `Run a two-week test with ${key} removed, or halve size until a fresh sample turns positive.`;
  if (dimension === "Mistake") return "Convert this mistake into a written rule and review every repeat on the same day.";
  if (dimension === "Playbook") return "Put this playbook on probation: reduce size and collect 20 clean samples before trusting it again.";
  return "Remove it for a two-week test or trade it at half size while collecting a cleaner sample.";
}

export function leakFindings(trades: readonly Trade[], playbooks: readonly Playbook[] = [], minTrades = 3): LeakFinding[] {
  const playbookName = (trade: Trade) => playbooks.find((item) => item.id === trade.playbookId)?.name ?? trade.setup ?? "No playbook";
  const dimensions: { label: string; keyOf: (trade: Trade) => string }[] = [
    { label: "Setup", keyOf: (t) => t.setup || "No setup" },
    { label: "Playbook", keyOf: playbookName },
    { label: "Symbol", keyOf: (t) => t.symbol },
    { label: "Account", keyOf: (t) => t.account?.trim() || "Main" },
    { label: "Session", keyOf: (t) => sessionLabel(t.session) },
    { label: "Symbol + session", keyOf: (t) => `${t.symbol} · ${sessionLabel(t.session)}` },
    { label: "Setup + session", keyOf: (t) => `${t.setup || "No setup"} · ${sessionLabel(t.session)}` },
    { label: "Weekday", keyOf: (t) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(t.closedAt).getDay()] },
    { label: "Entry emotion", keyOf: (t) => (t.entryEmotion ? emotionLabel(t.entryEmotion) : "Untagged") },
    { label: "Exit emotion", keyOf: (t) => (t.exitEmotion ? emotionLabel(t.exitEmotion) : "Untagged") },
    { label: "Mistake", keyOf: (t) => t.mistake?.trim() || "None recorded" },
    { label: "Market", keyOf: (t) => t.market },
    { label: "Timeframe", keyOf: (t) => t.timeframe || "Untagged" },
    { label: "Confidence", keyOf: (t) => (t.confidence ? `${t.confidence}/5` : "Untagged") },
    { label: "Hour", keyOf: (t) => `${String(new Date(t.openedAt).getHours()).padStart(2, "0")}:00` },
    { label: "Duration", keyOf: durationBucket },
  ];

  const findings: LeakFinding[] = [];
  for (const dimension of dimensions) {
    for (const group of groupTrades([...trades], dimension.keyOf)) {
      if (group.count < minTrades) continue;
      if (group.net >= 0 && (group.avgR == null || group.avgR >= 0)) continue;
      if (["Untagged", "None recorded", "Unknown"].includes(group.key)) continue;
      const matching = trades.filter((trade) => dimension.keyOf(trade) === group.key);
      findings.push({
        ...group,
        dimension: dimension.label,
        tradeIds: matching.map((trade) => trade.id),
        severity: Math.abs(Math.min(group.net, 0)) + Math.abs(Math.min(group.avgR ?? 0, 0)) * 250 + group.count * 5,
        action: leakAction(dimension.label, group.key),
      });
    }
  }
  return findings.sort((a, b) => b.severity - a.severity).slice(0, 12);
}

export function bestConditions(trades: readonly Trade[], minTrades = 3): (GroupStat & { dimension: string })[] {
  const dimensions: { label: string; keyOf: (trade: Trade) => string }[] = [
    { label: "Setup", keyOf: (t) => t.setup || "No setup" },
    { label: "Symbol", keyOf: (t) => t.symbol },
    { label: "Session", keyOf: (t) => sessionLabel(t.session) },
    { label: "Entry emotion", keyOf: (t) => (t.entryEmotion ? emotionLabel(t.entryEmotion) : "Untagged") },
    { label: "Timeframe", keyOf: (t) => t.timeframe || "Untagged" },
    { label: "Duration", keyOf: durationBucket },
  ];
  const results: (GroupStat & { dimension: string })[] = [];
  for (const dimension of dimensions) {
    for (const group of groupTrades([...trades], dimension.keyOf)) {
      if (group.count >= minTrades && group.net > 0 && !["Untagged", "Unknown"].includes(group.key)) {
        results.push({ ...group, dimension: dimension.label });
      }
    }
  }
  return results.sort((a, b) => (b.avgR ?? -99) - (a.avgR ?? -99) || b.net - a.net).slice(0, 8);
}

export function reflectionPrompts(trade: Trade): string[] {
  const pnl = tradePnl(trade);
  const prompts = [
    trade.followedPlan
      ? "Which exact criteria made this valid—and which criterion was weakest?"
      : "What happened in the 60 seconds before you traded away from the plan?",
    pnl > 0
      ? "Was the profit plan quality, execution, size—or favorable variance? What is the evidence?"
      : pnl < 0
        ? "Was this a good loss (valid setup, defined risk) or a process loss?"
        : "Did breakeven protect capital, or close a still-valid idea early?",
    "What would make you take—or refuse—the identical setup tomorrow?",
  ];
  if (trade.entryEmotion && ["anxious", "fomo", "frustrated", "revenge", "bored"].includes(trade.entryEmotion)) {
    prompts.push(`You entered feeling ${emotionLabel(trade.entryEmotion).toLowerCase()}. What cue should trigger a pause next time?`);
  }
  if (!trade.stop) prompts.push("No stop was recorded. At what price was the idea actually wrong?");
  if (trade.mistake) prompts.push(`Mistake logged: “${trade.mistake}”. What friction makes that harder to repeat?`);
  return prompts.slice(0, 5);
}

export type WeeklyReport = {
  title: string;
  summary: string;
  strengths: string[];
  leaks: LeakFinding[];
  focus: string;
  markdown: string;
};

export function generateWeeklyReport(
  trades: readonly Trade[],
  startingBalance: number,
  playbooks: readonly Playbook[] = [],
  days = 7,
  now = new Date(),
): WeeklyReport {
  const start = now.getTime() - days * 86400000;
  const period = trades.filter((trade) => Date.parse(trade.closedAt) >= start && Date.parse(trade.closedAt) <= now.getTime() + 86400000);
  const analysisTrades = period.length >= 9 ? period : trades;
  const stats = journalStats([...period], startingBalance);
  const leaks = leakFindings(analysisTrades, playbooks, 3);
  const best = bestConditions(analysisTrades, 3);
  const score = santandcScore(period.length ? period : trades, startingBalance);
  const planRate = period.length ? period.filter((trade) => trade.followedPlan).length / period.length : null;
  const offPlanNet = moneyRound(period.filter((trade) => !trade.followedPlan).reduce((sum, trade) => sum + tradePnl(trade), 0));

  const strengths: string[] = [];
  if (best[0]) strengths.push(`${best[0].dimension} “${best[0].key}” produced ${formatMoney(best[0].net)} over ${best[0].count} trades (${formatR(best[0].avgR)} avg R).`);
  if (planRate != null && planRate >= 0.8) strengths.push(`Plan adherence was ${formatPct(planRate)}, so the sample is clean enough to interpret.`);
  if (stats.profitFactor != null && stats.profitFactor >= 1.4) strengths.push(`Profit factor was ${Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}; winners covered losers with room to spare.`);
  if (!strengths.length) strengths.push(period.length ? "The journal stayed current. Honest records are what make the next adjustment evidence-based instead of emotional." : "No trades closed in this window. A quiet week is useful if it came from selectivity, not avoidance.");

  let focus = "Keep the playbook frozen and improve journal completeness: stop, target, entry/exit emotions, screenshot and one lesson on every trade.";
  if (leaks[0]) focus = leaks[0].action;
  else if (planRate != null && planRate < 0.8) focus = "Raise plan adherence before changing strategy; off-plan trades are contaminating the sample.";

  const summary = period.length
    ? `${period.length} closes for ${formatMoney(stats.net)} (${formatR(stats.avgR)} avg R, ${formatPct(stats.winRate)} win rate). SANTANDC Score ${score.score}/100 · ${score.label}. Off-plan trades contributed ${formatMoney(offPlanNet)}.`
    : `No closes in the last ${days} days. Leak detection below uses the full journal.`;

  const markdown = [
    `# SANTANDC ${days}-day journal review`,
    "",
    summary,
    "",
    "## What is working",
    ...strengths.map((item) => `- ${item}`),
    "",
    "## Leaks to cut",
    ...(leaks.length
      ? leaks.slice(0, 5).map((leak) => `- **${leak.dimension}: ${leak.key}** — ${formatMoney(leak.net)} over ${leak.count} trades (${formatR(leak.avgR)} avg R). ${leak.action}`)
      : ["- No group cleared the minimum three-trade leak filter. Keep tagging setups, playbooks, emotions and mistakes consistently."]),
    "",
    "## One focus next",
    focus,
    "",
    "_Generated locally from your journal. Performance review only—not a trade signal or financial advice._",
  ].join("\n");

  return { title: `${days}-day journal review`, summary, strengths, leaks, focus, markdown };
}

export function journalCompleteness(trades: readonly Trade[]) {
  const count = trades.length;
  const ratio = (predicate: (trade: Trade) => boolean) => (count ? trades.filter(predicate).length / count : null);
  return {
    count,
    withStop: ratio((t) => t.stop != null),
    withTarget: ratio((t) => t.target != null),
    withPlaybook: ratio((t) => Boolean(t.playbookId)),
    withEmotions: ratio((t) => Boolean(t.entryEmotion && t.exitEmotion)),
    withScreenshot: ratio((t) => Boolean(t.screenshots?.length)),
    withLesson: ratio((t) => Boolean(t.lesson?.trim() || t.notes.trim())),
    withTradingView: ratio((t) => Boolean(t.tvSymbol?.trim() || t.symbol.trim())),
  };
}

export function rollingComparison(trades: readonly Trade[], startingBalance: number, blockSize = 20) {
  const sorted = [...trades].sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
  const latest = sorted.slice(-blockSize);
  const prior = sorted.slice(-blockSize * 2, -blockSize);
  return {
    latest: journalStats(latest, startingBalance),
    prior: prior.length ? journalStats(prior, startingBalance) : null,
    latestCount: latest.length,
    priorCount: prior.length,
  };
}
