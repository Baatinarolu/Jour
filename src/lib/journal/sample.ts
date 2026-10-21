import { dayKey } from "./format.ts";
import { weekEndKey, weekStartKey, weekTrades, weeklySnapshot } from "./insights.ts";
import { presetPlaybooks } from "./playbooks.ts";
import type { DayEntries, Emotion, Playbook, Rule, Trade, WeeklyReview } from "./types.ts";

function iso(daysAgo: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dayTrade(
  partial: Omit<Trade, "openedAt" | "closedAt"> & {
    daysAgo: number;
    openHour: number;
    closeHour: number;
  },
): Trade {
  const { daysAgo, openHour, closeHour, ...rest } = partial;
  return {
    ...rest,
    openedAt: iso(daysAgo, openHour, 32),
    closedAt: iso(daysAgo, closeHour, 8),
  };
}

export const SAMPLE_RULES: Rule[] = [
  { id: "r1", text: "Risk is defined before the order, and it is at most 1R." },
  { id: "r2", text: "No trade in the first five minutes unless it was planned." },
  { id: "r3", text: "Two losses and the session is finished." },
  { id: "r4", text: "Size comes from the stop, never from how sure it feels." },
  { id: "r5", text: "Write the lesson before the next order." },
];

export function buildSample(): {
  trades: Trade[];
  rules: Rule[];
  playbooks: Playbook[];
  activePlaybookId: string | null;
  dayEntries: DayEntries;
  weeklyReviews: WeeklyReview[];
} {
  const trades: Trade[] = [
    dayTrade({
      id: "t-aapl-1",
      daysAgo: 38,
      openHour: 10,
      closeHour: 15,
      symbol: "AAPL",
      market: "stocks",
      side: "long",
      entry: 226.4,
      exit: 231.15,
      quantity: 50,
      multiplier: 1,
      stop: 223.8,
      fees: 1.2,
      setup: "Pullback",
      session: "newyork",
      grade: "A",
      followedPlan: true,
      notes: "First pullback to the opening range high. Sold into the prior day high.",
      tags: [],
    }),
    dayTrade({
      id: "t-es-1",
      daysAgo: 36,
      openHour: 10,
      closeHour: 11,
      symbol: "ES",
      market: "futures",
      side: "short",
      entry: 5742,
      exit: 5768,
      quantity: 1,
      multiplier: 50,
      stop: 5754,
      fees: 4.2,
      setup: "Opening drive",
      session: "newyork",
      grade: "C",
      followedPlan: false,
      notes: "Drive failed and I held through the stop. The idea was fine. The exit was not.",
      tags: ["held loser"],
    }),
    dayTrade({
      id: "t-nvda-1",
      daysAgo: 34,
      openHour: 11,
      closeHour: 15,
      symbol: "NVDA",
      market: "stocks",
      side: "long",
      entry: 131.2,
      exit: 136.8,
      quantity: 30,
      multiplier: 1,
      stop: 128.4,
      fees: 1.5,
      setup: "Breakout",
      session: "newyork",
      grade: "A",
      followedPlan: true,
      notes: "Broke the morning shelf and held to the measured move. Did not add.",
      tags: [],
    }),
    dayTrade({
      id: "t-eur-1",
      daysAgo: 31,
      openHour: 4,
      closeHour: 8,
      symbol: "EURUSD",
      market: "forex",
      side: "long",
      entry: 1.172,
      exit: 1.1768,
      quantity: 100000,
      multiplier: 1,
      stop: 1.1695,
      fees: 7,
      setup: "Pullback",
      session: "london",
      grade: "A",
      followedPlan: true,
      notes: "London pullback into yesterday’s value. Target was the Asia high.",
      tags: [],
    }),
    dayTrade({
      id: "t-btc-1",
      daysAgo: 29,
      openHour: 21,
      closeHour: 23,
      symbol: "BTC",
      market: "crypto",
      side: "long",
      entry: 63200,
      exit: 61840,
      quantity: 0.15,
      multiplier: 1,
      stop: 62400,
      fees: 8,
      setup: "Breakout",
      session: "asia",
      grade: "B",
      followedPlan: true,
      notes: "Breakout failed. Stopped where I said I would. No second try.",
      tags: [],
    }),
    dayTrade({
      id: "t-amd",
      daysAgo: 27,
      openHour: 10,
      closeHour: 14,
      symbol: "AMD",
      market: "stocks",
      side: "long",
      entry: 164.5,
      exit: 171.2,
      quantity: 40,
      multiplier: 1,
      stop: 160,
      fees: 1.3,
      setup: "Pullback",
      session: "newyork",
      grade: "A",
      followedPlan: true,
      notes: "Higher low against the open. Trailed once it cleared the morning high.",
      tags: [],
    }),
    dayTrade({
      id: "t-es-2",
      daysAgo: 24,
      openHour: 10,
      closeHour: 13,
      symbol: "ES",
      market: "futures",
      side: "long",
      entry: 5810,
      exit: 5842,
      quantity: 1,
      multiplier: 50,
      stop: 5796,
      fees: 4.2,
      setup: "Opening drive",
      session: "newyork",
      grade: "A",
      followedPlan: true,
      notes: "One contract. Took the planned scale at 2R and left the rest.",
      tags: [],
    }),
    dayTrade({
      id: "t-gbp",
      daysAgo: 22,
      openHour: 3,
      closeHour: 7,
      symbol: "GBPUSD",
      market: "forex",
      side: "short",
      entry: 1.341,
      exit: 1.3362,
      quantity: 80000,
      multiplier: 1,
      stop: 1.344,
      fees: 6,
      setup: "Mean revert",
      session: "london",
      grade: "B",
      followedPlan: true,
      notes: "Fade of the Asia extension. Covered into the session open price.",
      tags: [],
    }),
    dayTrade({
      id: "t-tsla",
      daysAgo: 20,
      openHour: 14,
      closeHour: 15,
      symbol: "TSLA",
      market: "stocks",
      side: "long",
      entry: 248,
      exit: 241.5,
      quantity: 20,
      multiplier: 1,
      stop: 244,
      fees: 1.1,
      setup: "Breakout",
      session: "newyork",
      grade: "C",
      followedPlan: false,
      notes: "Chased a late breakout that was already extended. Stop was ignored for a minute too long.",
      tags: ["late entry"],
    }),
    dayTrade({
      id: "t-nvda-2",
      daysAgo: 18,
      openHour: 11,
      closeHour: 13,
      symbol: "NVDA",
      market: "stocks",
      side: "short",
      entry: 142.6,
      exit: 138.9,
      quantity: 25,
      multiplier: 1,
      stop: 145.2,
      fees: 1.4,
      setup: "Reversal",
      session: "newyork",
      grade: "B",
      followedPlan: false,
      notes: "Not on the list. Got paid. Still a leak if I start trusting leftovers.",
      tags: ["unplanned"],
    }),
    dayTrade({
      id: "t-nq",
      daysAgo: 16,
      openHour: 10,
      closeHour: 11,
      symbol: "NQ",
      market: "futures",
      side: "long",
      entry: 21450,
      exit: 21280,
      quantity: 1,
      multiplier: 20,
      stop: 21390,
      fees: 4.5,
      setup: "Opening drive",
      session: "newyork",
      grade: "F",
      followedPlan: false,
      notes: "Doubled size after the ES winner. The stop was right. The size was not.",
      tags: ["oversize"],
    }),
    dayTrade({
      id: "t-cl",
      daysAgo: 15,
      openHour: 10,
      closeHour: 14,
      symbol: "CL",
      market: "futures",
      side: "long",
      entry: 71.4,
      exit: 73.15,
      quantity: 1,
      multiplier: 1000,
      stop: 70.6,
      fees: 5,
      setup: "Breakout",
      session: "newyork",
      grade: "A",
      followedPlan: true,
      notes: "Inventory report held above the break. One contract, full target.",
      tags: [],
    }),
    dayTrade({
      id: "t-aapl-2",
      daysAgo: 13,
      openHour: 11,
      closeHour: 12,
      symbol: "AAPL",
      market: "stocks",
      side: "short",
      entry: 234.2,
      exit: 236.8,
      quantity: 40,
      multiplier: 1,
      stop: 236,
      fees: 1,
      setup: "Mean revert",
      session: "newyork",
      grade: "B",
      followedPlan: true,
      notes: "Fade didn’t bite. Out just through the stop. Left it alone.",
      tags: [],
    }),
    dayTrade({
      id: "t-es-3",
      daysAgo: 10,
      openHour: 10,
      closeHour: 15,
      symbol: "ES",
      market: "futures",
      side: "short",
      entry: 5920,
      exit: 5894,
      quantity: 1,
      multiplier: 50,
      stop: 5932,
      fees: 4.2,
      setup: "Pullback",
      session: "newyork",
      grade: "A",
      followedPlan: true,
      notes: "Pullback into the open after a failed high. Held for the morning low.",
      tags: [],
    }),
    dayTrade({
      id: "t-meta",
      daysAgo: 8,
      openHour: 10,
      closeHour: 15,
      symbol: "META",
      market: "stocks",
      side: "long",
      entry: 582,
      exit: 591.4,
      quantity: 15,
      multiplier: 1,
      stop: 574,
      fees: 1.2,
      setup: "Pullback",
      session: "newyork",
      grade: "B",
      followedPlan: true,
      notes: "Slow. Almost scratched it. The level held, so I let the target work.",
      tags: [],
    }),
    dayTrade({
      id: "t-eur-2",
      daysAgo: 6,
      openHour: 4,
      closeHour: 6,
      symbol: "EURUSD",
      market: "forex",
      side: "short",
      entry: 1.1688,
      exit: 1.1712,
      quantity: 100000,
      multiplier: 1,
      stop: 1.1705,
      fees: 7,
      setup: "News fade",
      session: "london",
      grade: "B",
      followedPlan: true,
      notes: "Fade was early. Slippage through the stop. Session ended there.",
      tags: [],
    }),
    dayTrade({
      id: "t-nvda-3",
      daysAgo: 4,
      openHour: 11,
      closeHour: 15,
      symbol: "NVDA",
      market: "stocks",
      side: "long",
      entry: 139.1,
      exit: 144.6,
      quantity: 35,
      multiplier: 1,
      stop: 136.4,
      fees: 1.5,
      setup: "Pullback",
      session: "newyork",
      grade: "A",
      followedPlan: true,
      notes: "Same setup as the last long. Did not increase size to ‘make it back’.",
      tags: [],
    }),
    dayTrade({
      id: "t-btc-2",
      daysAgo: 2,
      openHour: 20,
      closeHour: 23,
      symbol: "BTC",
      market: "crypto",
      side: "short",
      entry: 67450,
      exit: 66120,
      quantity: 0.2,
      multiplier: 1,
      stop: 68200,
      fees: 9,
      setup: "Reversal",
      session: "asia",
      grade: "A",
      followedPlan: true,
      notes: "Failed break of the day high. Covered into the prior shelf.",
      tags: [],
    }),
    dayTrade({
      id: "t-es-4",
      daysAgo: 1,
      openHour: 10,
      closeHour: 11,
      symbol: "ES",
      market: "futures",
      side: "long",
      entry: 5988,
      exit: 5972,
      quantity: 1,
      multiplier: 50,
      stop: 5976,
      fees: 4.2,
      setup: "Opening drive",
      session: "newyork",
      grade: "B",
      followedPlan: true,
      notes: "Drive reversed. Out near the stop. Did not flip short.",
      tags: [],
    }),
  ];

  const playbooks = presetPlaybooks();
  const playbookFor = (setup: string): string => {
    if (/pullback/i.test(setup)) return "playbook-trend-pullback";
    if (/opening|breakout/i.test(setup)) return "playbook-opening-range";
    return "playbook-liquidity-reversal";
  };
  const emotionFor = (trade: Trade): { entry: Emotion; exit: Emotion; mistake: string } => {
    if (trade.tags.includes("oversize")) return { entry: "euphoric", exit: "frustrated", mistake: "Oversized after a winner" };
    if (trade.tags.includes("late entry")) return { entry: "fomo", exit: "frustrated", mistake: "Chased a late entry" };
    if (trade.tags.includes("held loser")) return { entry: "anxious", exit: "frustrated", mistake: "Held through the stop" };
    if (trade.tags.includes("unplanned")) return { entry: "bored", exit: "neutral", mistake: "Traded outside the watchlist" };
    return { entry: trade.grade === "A" || trade.grade === "A+" ? "focused" : "calm", exit: "neutral", mistake: "" };
  };
  const enriched = trades.map((trade) => {
    const emotions = emotionFor(trade);
    const riskDistance = trade.stop == null ? 0 : Math.abs(trade.entry - trade.stop);
    const target = trade.stop == null ? null : trade.side === "long" ? trade.entry + riskDistance * 2 : trade.entry - riskDistance * 2;
    const playbook = playbooks.find((item) => item.id === playbookFor(trade.setup));
    const roundPrice = (value: number) => Math.round(value * 10000) / 10000;
    const mae = trade.stop == null
      ? null
      : roundPrice(trade.side === "long" ? Math.min(trade.entry - riskDistance * 0.35, trade.exit) : Math.max(trade.entry + riskDistance * 0.35, trade.exit));
    const mfe = trade.stop == null
      ? null
      : roundPrice(trade.side === "long" ? Math.max(trade.entry + riskDistance * 0.6, trade.exit) : Math.min(trade.entry - riskDistance * 0.6, trade.exit));
    return {
      ...trade,
      account: "Main",
      playbookId: playbook?.id ?? null,
      target: target == null ? null : Math.round(target * 10000) / 10000,
      timeframe: playbook?.timeframes[0] ?? "15m",
      entryEmotion: emotions.entry,
      exitEmotion: emotions.exit,
      confidence: trade.grade === "A+" || trade.grade === "A" ? 5 : trade.grade === "B" ? 4 : trade.grade === "C" ? 2 : 1,
      mistake: emotions.mistake,
      lesson: trade.notes,
      entryReason: `${trade.setup || "Planned setup"} at the marked level during the ${trade.session} session.`,
      exitReason: "Exited at the recorded close; see lesson for management quality.",
      criteriaChecked: trade.followedPlan ? (playbook?.entryCriteria ?? []) : (playbook?.entryCriteria.slice(0, 2) ?? []),
      mae,
      mfe,
      screenshots: [],
      source: "sample" as const,
    };
  });

  const nowIso = new Date().toISOString();
  const sampleDayCopy = [
    {
      focus: "Take only the first planned setup. No second attempt.",
      well: "Waited for the level and let the planned target do the work.",
      mistakes: "Checked the P&L too often while price was still inside the plan.",
    },
    {
      focus: "Protect the morning: one A setup, then reassess.",
      well: "Stopped after the plan stopped working instead of trying to earn it back.",
      mistakes: "The first entry was early; confirmation would have improved location.",
    },
    {
      focus: "Trade the playbook, not the boredom between setups.",
      well: "Every order had a stop and a written reason before entry.",
      mistakes: "Let one ordinary trade take more attention than it deserved.",
    },
    {
      focus: "Size from the stop. Two losses ends the session.",
      well: "Kept size normal after a winner and finished the review before logging off.",
      mistakes: "Reviewed the result before reviewing the execution.",
    },
  ];
  const recentSampleDays = [
    ...new Map(enriched.map((trade) => [dayKey(trade.closedAt), trade] as const)).entries(),
  ].slice(-4);
  const dayEntries: DayEntries = {};
  recentSampleDays.forEach(([date], index) => {
    const dayList = enriched.filter((trade) => dayKey(trade.closedAt) === date);
    const first = dayList[0];
    if (!first) return;
    const copy = sampleDayCopy[index % sampleDayCopy.length];
    const mistakes = [...new Set(dayList.map((trade) => trade.mistake).filter(Boolean))].join("; ");
    dayEntries[date] = {
      date,
      planFocus: copy.focus,
      planBias: `${first.setup || "Planned setup"} only, in the ${first.session} session. Stand aside if the level does not come to me.`,
      planNotes: "Sample plan: mark the prior high/low, define invalidation, and write the exit before the first order.",
      allowedPlaybookIds: [...new Set(dayList.map((trade) => trade.playbookId).filter((id): id is string => Boolean(id)))],
      maxLossR: 2,
      readiness: [4, 3, 5, 4][index % 4],
      reviewWentWell: copy.well,
      reviewMistakes: mistakes || copy.mistakes,
      reviewLesson: first.lesson || first.notes,
      reviewNotes: "Sample daily entry. Replace it with the plan and review for your own trading day.",
      followedPlan: dayList.every((trade) => trade.followedPlan),
      dayGrade: first.grade,
      createdAt: `${date}T08:00:00.000Z`,
      updatedAt: `${date}T21:00:00.000Z`,
    };
  });

  const latestTrade = enriched.at(-1);
  const sampleWeekStart = weekStartKey(latestTrade?.closedAt ?? nowIso);
  const sampleWeekTrades = weekTrades(enriched, sampleWeekStart);
  const weeklyReviews: WeeklyReview[] = [
    {
      id: "sample-weekly-review",
      weekStart: sampleWeekStart,
      weekEnd: weekEndKey(sampleWeekStart),
      keptDoing: "Waiting for planned levels and writing the lesson while the trade is still fresh.",
      stopDoing: "Letting one excited or frustrated trade change the size of the next one.",
      bestTrade: latestTrade
        ? `${latestTrade.symbol} ${latestTrade.setup}: the process was clear before entry and the exit matched the plan.`
        : "No standout trade this week.",
      worstTrade: "The most expensive trades were the ones where location or size came from emotion instead of the playbook.",
      biggestLesson: "A good loss at planned size is information; an oversized win is still a process leak.",
      nextFocus: "Only A/B playbook trades for the first hour. Stop after two planned losses.",
      notes: "Sample weekly review. Use the prompts at the end of your own trading week.",
      snapshot: weeklySnapshot(sampleWeekTrades),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  return {
    trades: enriched,
    rules: SAMPLE_RULES.map((rule) => ({ ...rule })),
    playbooks,
    activePlaybookId: playbooks[0]?.id ?? null,
    dayEntries,
    weeklyReviews,
  };
}
