import assert from "node:assert/strict";
import test from "node:test";
import { parseBackup, serializeBackup } from "./backup.ts";
import { buildPerformanceSeries, excursionR, journalStats, ruleHistory, tagGroups, tradeFingerprint, tradePnl, tradeR, tradeRisk } from "./calc.ts";
import { parseCsvTrades, tradesToCsv } from "./csv.ts";
import { calculateQuantity, dayTrades, filterTradesByRange, generateWeeklyReport, leakFindings, santandcScore, shiftDayKey, weekEndKey, weekStartKey, weekTrades, weeklySnapshot } from "./insights.ts";
import { presetPlaybooks } from "./playbooks.ts";
import { buildSample } from "./sample.ts";
import { inferTradingViewSymbol, tradingViewChartUrl, tradingViewInterval } from "./tradingview.ts";
import type { Trade } from "./types.ts";

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "trade-1",
    symbol: "AAPL",
    market: "stocks",
    side: "long",
    openedAt: "2026-01-02T14:30:00.000Z",
    closedAt: "2026-01-02T15:00:00.000Z",
    entry: 100,
    exit: 110,
    quantity: 2,
    multiplier: 1,
    stop: 95,
    fees: 1,
    setup: "Pullback",
    session: "newyork",
    grade: "A",
    followedPlan: true,
    notes: "Waited for the level.",
    tags: ["patient"],
    account: "Main",
    playbookId: null,
    target: 110,
    timeframe: "15m",
    tvSymbol: "NASDAQ:AAPL",
    entryEmotion: "focused",
    exitEmotion: "calm",
    confidence: 4,
    mistake: "",
    lesson: "Wait for the level, not the first candle.",
    entryReason: "Pullback reached the marked level.",
    exitReason: "Reached target.",
    screenshots: [],
    voiceNote: "",
    criteriaChecked: ["Level reached"],
    mae: 99,
    mfe: 111,
    source: "csv",
    externalId: "broker-1",
    ...overrides,
  };
}

test("P&L and R use the contract multiplier", () => {
  const stock = makeTrade();
  assert.equal(tradePnl(stock), 19);
  assert.equal(tradeRisk(stock), 10);
  assert.equal(tradeR(stock), 1.9);

  const option = makeTrade({
    id: "option-1",
    symbol: "SPY 500C",
    market: "options",
    entry: 2,
    exit: 3,
    quantity: 2,
    multiplier: 100,
    stop: 1.5,
    fees: 5,
  });
  assert.equal(tradePnl(option), 195);
  assert.equal(tradeRisk(option), 100);
  assert.equal(tradeR(option), 1.95);
});

test("a stop on the profit side produces no risk or R", () => {
  assert.equal(tradeRisk(makeTrade({ stop: 100 })), null);
  assert.equal(tradeRisk(makeTrade({ stop: 101 })), null);
  assert.equal(tradeR(makeTrade({ side: "short", stop: 99 })), null);
});

test("journal stats expose averages and null drawdown percentage without a positive peak", () => {
  const loss = makeTrade({
    id: "loss-1",
    exit: 90,
    quantity: 1,
    fees: 0,
    closedAt: "2026-01-03T15:00:00.000Z",
  });
  const stats = journalStats([loss], 0);
  assert.equal(stats.net, -10);
  assert.equal(stats.maxDrawdown, 10);
  assert.equal(stats.maxDrawdownPct, null);
  assert.equal(stats.avgLoss, -10);

  const mixed = journalStats([makeTrade(), loss], 100);
  assert.equal(mixed.avgWin, 19);
  assert.equal(mixed.avgLoss, -10);
  assert.equal(mixed.grossProfit, 19);
  assert.equal(mixed.grossLoss, -10);
  assert.equal(mixed.maxDrawdownPct, 10 / 119);
});

test("tag groups count a trade under every tag it carries", () => {
  const winner = makeTrade({ tags: ["Breakout", " momentum ", "breakout"] });
  const loser = makeTrade({
    id: "trade-2",
    exit: 90,
    quantity: 1,
    fees: 0,
    tags: ["breakout"],
  });
  const groups = tagGroups([winner, loser]);
  assert.deepEqual(
    groups.map(({ key, count, net }) => ({ key, count, net })),
    [
      { key: "breakout", count: 2, net: 9 },
      { key: "momentum", count: 1, net: 19 },
    ],
  );
});

test("rule history returns the trailing days and ignores orphan checks", () => {
  const rules = [
    { id: "rule-1", text: "Size down" },
    { id: "rule-2", text: "No revenge trade" },
  ];
  const history = ruleHistory(
    { "2026-10-21": ["rule-1", "deleted-rule"] },
    rules,
    14,
    new Date(2026, 9, 21, 12),
  );
  assert.equal(history.length, 14);
  assert.equal(history[0]?.date, "2026-10-08");
  assert.deepEqual(history.at(-1), {
    date: "2026-10-21",
    honored: 1,
    total: 2,
    ratio: 0.5,
  });
});

test("legacy v1 backups are normalized to v4", () => {
  const legacyTrade: Record<string, unknown> = { ...makeTrade() };
  delete legacyTrade.multiplier;
  legacyTrade.symbol = " aapl ";
  legacyTrade.tags = [" Patient ", "patient", ""];

  const parsed = parseBackup(
    JSON.stringify({
      version: 1,
      startingBalance: 25000,
      trades: [legacyTrade, { ...legacyTrade, symbol: "MSFT" }],
      rules: [
        { id: "rule-1", text: "  Size down  " },
        { id: "rule-1", text: "Duplicate" },
      ],
      checks: {
        "2026-01-02": ["rule-1", "missing-rule", "rule-1"],
        "not-a-date": ["rule-1"],
      },
      sampleBanner: false,
    }),
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.version, 4);
  assert.deepEqual(parsed.data.dayEntries, {});
  assert.deepEqual(parsed.data.weeklyReviews, []);
  assert.equal(parsed.data.trades.length, 1);
  assert.equal(parsed.data.trades[0]?.symbol, "AAPL");
  assert.equal(parsed.data.trades[0]?.multiplier, 1);
  assert.deepEqual(parsed.data.trades[0]?.tags, ["patient"]);
  assert.deepEqual(parsed.data.rules, [{ id: "rule-1", text: "Size down" }]);
  assert.deepEqual(parsed.data.checks, { "2026-01-02": ["rule-1"] });
  assert.equal(parsed.data.trades[0]?.account, "Main");
  assert.equal(parsed.data.playbooks.length, 3);
  assert.equal(parsed.data.activePlaybookId, parsed.data.playbooks[0]?.id);
});

test("legacy v2/v3 backups normalize and v4 backups round-trip daily journal fields", () => {
  const legacy = {
    version: 2 as const,
    startingBalance: 10000,
    trades: [makeTrade({ multiplier: 100 })],
    rules: [{ id: "rule-1", text: "Wait" }],
    checks: { "2026-01-02": ["rule-1"] },
    sampleBanner: false,
  };
  const normalized = parseBackup(JSON.stringify(legacy));
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.equal(normalized.data.version, 4);
    assert.deepEqual(normalized.data.dayEntries, {});
    assert.deepEqual(normalized.data.weeklyReviews, []);
    assert.equal(normalized.data.trades[0]?.multiplier, 100);
  }

  const playbooks = presetPlaybooks("2026-01-01T00:00:00.000Z");
  const backup = {
    version: 3 as const,
    startingBalance: 10000,
    trades: [makeTrade({ playbookId: playbooks[0].id, screenshots: ["data:image/jpeg;base64,abc"] })],
    rules: [{ id: "rule-1", text: "Wait" }],
    checks: { "2026-01-02": ["rule-1"] },
    sampleBanner: false,
    playbooks,
    activePlaybookId: playbooks[0].id,
  };
  const roundTripped = parseBackup(JSON.stringify(backup));
  assert.equal(roundTripped.ok, true);
  if (roundTripped.ok) {
    assert.equal(roundTripped.data.version, 4);
    assert.deepEqual(roundTripped.data.dayEntries, {});
    assert.deepEqual(roundTripped.data.weeklyReviews, []);
    assert.equal(roundTripped.data.trades[0]?.tvSymbol, "NASDAQ:AAPL");
    assert.deepEqual(roundTripped.data.trades[0]?.screenshots, ["data:image/jpeg;base64,abc"]);
    assert.equal(roundTripped.data.activePlaybookId, playbooks[0].id);
  }

  const dailyBackup = {
    version: 4 as const,
    startingBalance: 10000,
    trades: backup.trades,
    rules: backup.rules,
    checks: backup.checks,
    sampleBanner: false,
    playbooks,
    activePlaybookId: playbooks[0].id,
    dayEntries: {
      "2026-01-02": {
        date: "2026-01-02",
        planFocus: "  Only A setups  ",
        planBias: "  Long above value  ",
        planNotes: "  Prior high is invalidation.  ",
        allowedPlaybookIds: [playbooks[0].id, "missing-playbook", playbooks[0].id],
        maxLossR: 2,
        readiness: 4.6,
        reviewWentWell: "  Waited for the level  ",
        reviewMistakes: "  Checked P&L too often  ",
        reviewLesson: "  Wait for displacement  ",
        reviewNotes: "  Calm session  ",
        followedPlan: true,
        dayGrade: "A" as const,
        createdAt: "2026-01-02T08:00:00.000Z",
        updatedAt: "2026-01-02T21:00:00.000Z",
      },
    },
    weeklyReviews: [
      {
        id: "weekly-1",
        weekStart: "2025-12-29",
        weekEnd: "2026-01-04",
        keptDoing: "  Waiting for planned levels  ",
        stopDoing: "  Chasing late entries  ",
        bestTrade: "  AAPL pullback  ",
        worstTrade: "  Early breakout  ",
        biggestLesson: "  Location before trigger  ",
        nextFocus: "  First setup only  ",
        notes: "  Light week  ",
        snapshot: {
          trades: 1,
          net: 19,
          totalR: 1.9,
          winRate: 1,
          avgR: 1.9,
          profitFactor: null,
          planRate: 1,
        },
        createdAt: "2026-01-04T12:00:00.000Z",
        updatedAt: "2026-01-04T12:30:00.000Z",
      },
    ],
  };
  const dailyRoundTripped = parseBackup(serializeBackup(dailyBackup));
  assert.equal(dailyRoundTripped.ok, true);
  if (dailyRoundTripped.ok) {
    assert.equal(dailyRoundTripped.data.version, 4);
    const entry = dailyRoundTripped.data.dayEntries["2026-01-02"];
    assert.equal(entry?.planFocus, "Only A setups");
    assert.deepEqual(entry?.allowedPlaybookIds, [playbooks[0].id]);
    assert.equal(entry?.readiness, 5);
    assert.equal(dailyRoundTripped.data.weeklyReviews[0]?.keptDoing, "Waiting for planned levels");
    assert.equal(dailyRoundTripped.data.weeklyReviews[0]?.snapshot.totalR, 1.9);
  }

  assert.equal(parseBackup("not json").ok, false);
  assert.equal(
    parseBackup(
      JSON.stringify({
        ...backup,
        trades: [makeTrade({ openedAt: "2026-01-03T00:00:00.000Z" })],
      }),
    ).ok,
    false,
  );
});

test("sample journal is valid v4 backup material with daily and excursion context", () => {
  const sample = buildSample();
  assert.ok(sample.trades.length > 10);
  assert.equal(sample.playbooks.length, 3);
  assert.ok(Object.keys(sample.dayEntries).length > 0);
  assert.equal(sample.weeklyReviews.length, 1);
  assert.ok(sample.trades.every((trade) => trade.mae != null && trade.mfe != null));
  const parsed = parseBackup(serializeBackup({
    version: 4,
    startingBalance: 25000,
    trades: sample.trades,
    rules: sample.rules,
    checks: {},
    sampleBanner: true,
    playbooks: sample.playbooks,
    activePlaybookId: sample.activePlaybookId,
    dayEntries: sample.dayEntries,
    weeklyReviews: sample.weeklyReviews,
  }));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(Object.keys(parsed.data.dayEntries).length, Object.keys(sample.dayEntries).length);
    assert.equal(parsed.data.weeklyReviews.length, 1);
  }
});

test("CSV export and import round-trip rich journal fields, quoted notes and tags", () => {
  const original = makeTrade({
    notes: 'Waited, then said "go"',
    tags: ["patient", "level"],
  });
  const parsed = parseCsvTrades(tradesToCsv([original]));
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.trades, [original]);
});

test("CSV import accepts common broker header aliases and multiplier defaults", () => {
  const csv = [
    "Ticker,Asset Class,Direction,Entry Date,Exit Date,Entry Price,Exit Price,Contracts,Commission,Strategy,Labels",
    "ES,Futures,Long,2026-01-02,2026-01-02,5000,5010,2,-4,Opening drive,patient; level",
    "SPY 500C,Options,Long,2026-01-02,2026-01-02,2,3,1,1,Breakout,options",
  ].join("\n");
  const parsed = parseCsvTrades(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.trades[0]?.multiplier, 50);
  assert.equal(parsed.trades[0]?.fees, 4);
  assert.deepEqual(parsed.trades[0]?.tags, ["patient", "level"]);
  assert.equal(parsed.trades[1]?.multiplier, 100);
});

test("CSV import reports bad rows, keeps good rows, and regenerates duplicate IDs", () => {
  const csv = [
    "id,symbol,market,side,openedAt,closedAt,entry,exit,quantity,stop",
    "same,AAPL,stocks,long,2026-01-02,2026-01-02,100,110,1,95",
    "same,MSFT,stocks,long,2026-01-02,2026-01-02,200,210,1,195",
    "bad-stop,NVDA,stocks,long,2026-01-02,2026-01-02,100,110,1,105",
    "bad-qty,TSLA,stocks,long,2026-01-02,2026-01-02,100,110,0,95",
  ].join("\n");
  const parsed = parseCsvTrades(csv);
  assert.equal(parsed.trades.length, 2);
  assert.notEqual(parsed.trades[0]?.id, parsed.trades[1]?.id);
  assert.equal(parsed.errors.length, 2);
  assert.match(parsed.errors[0] ?? "", /long stop/);
  assert.match(parsed.errors[1] ?? "", /quantity/);

  const missing = parseCsvTrades("symbol,entry\nAAPL,100");
  assert.equal(missing.trades.length, 0);
  assert.match(missing.errors[0] ?? "", /Missing required columns/);
});


test("daily and weekly helpers use local Monday boundaries and stable snapshots", () => {
  assert.equal(shiftDayKey("2026-01-31", 1), "2026-02-01");
  assert.equal(weekStartKey("2026-01-02"), "2025-12-29");
  assert.equal(weekStartKey(new Date(2026, 0, 4, 12)), "2025-12-29");
  assert.equal(weekEndKey("2025-12-29"), "2026-01-04");

  const monday = makeTrade({
    id: "monday",
    openedAt: "2025-12-29T14:30:00.000Z",
    closedAt: "2025-12-29T15:00:00.000Z",
  });
  const friday = makeTrade();
  const sunday = makeTrade({
    id: "sunday",
    openedAt: "2026-01-04T14:30:00.000Z",
    closedAt: "2026-01-04T15:00:00.000Z",
  });
  const nextMonday = makeTrade({
    id: "next-monday",
    openedAt: "2026-01-05T14:30:00.000Z",
    closedAt: "2026-01-05T15:00:00.000Z",
  });
  const all = [nextMonday, sunday, friday, monday];

  assert.deepEqual(dayTrades(all, "2026-01-02").map((trade) => trade.id), ["trade-1"]);
  assert.deepEqual(
    weekTrades(all, "2026-01-02").map((trade) => trade.id),
    ["monday", "trade-1", "sunday"],
  );

  const loss = makeTrade({
    id: "snapshot-loss",
    exit: 90,
    quantity: 1,
    fees: 0,
    followedPlan: false,
  });
  const snapshot = weeklySnapshot([makeTrade(), loss]);
  assert.equal(snapshot.trades, 2);
  assert.equal(snapshot.net, 9);
  assert.equal(snapshot.totalR, -0.1);
  assert.equal(snapshot.winRate, 0.5);
  assert.ok(Math.abs((snapshot.avgR ?? 0) + 0.05) < 1e-9);
  assert.equal(snapshot.profitFactor, 1.9);
  assert.equal(snapshot.planRate, 0.5);
});

test("TradingView mapping handles common journal shorthand and preserves exact symbols", () => {
  assert.equal(inferTradingViewSymbol("ES", "futures"), "CME_MINI:ES1!");
  assert.equal(inferTradingViewSymbol("EURUSD", "forex"), "FX:EURUSD");
  assert.equal(inferTradingViewSymbol("BTC", "crypto"), "BINANCE:BTCUSDT");
  assert.equal(inferTradingViewSymbol("AAPL", "stocks", "NASDAQ:AAPL"), "NASDAQ:AAPL");
  assert.equal(tradingViewInterval("4H"), "240");
  assert.equal(tradingViewInterval(""), "5");
  assert.match(
    tradingViewChartUrl(makeTrade({ symbol: "NVDA", tvSymbol: "NASDAQ:NVDA", timeframe: "15m" })),
    /symbol=NASDAQ%3ANVDA.*interval=15/,
  );
});

test("position sizing, performance modes, excursions and fingerprints are deterministic", () => {
  const sizing = calculateQuantity({ balance: 25000, riskPct: 1, entry: 100, stop: 95, multiplier: 1 });
  assert.equal(sizing.valid, true);
  assert.equal(sizing.quantity, 50);
  assert.equal(sizing.risk, 250);

  const trade = makeTrade();
  assert.deepEqual(excursionR(trade), { maeR: 0.2, mfeR: 2.2 });
  assert.equal(tradeFingerprint(trade), tradeFingerprint({ ...trade, id: "different-local-id" }));

  const series = buildPerformanceSeries([trade], 100, "r");
  assert.equal(series.at(-1)?.value, 1.9);
  assert.equal(buildPerformanceSeries([trade], 100, "pct").at(-1)?.value, 0.19);
});

test("range filters, score, leak detection and local report read journal context", () => {
  const rangeTrades = [
    makeTrade({ id: "old", closedAt: "2026-01-02T15:00:00.000Z" }),
    makeTrade({ id: "new", closedAt: "2026-01-30T15:00:00.000Z" }),
  ];
  assert.deepEqual(
    filterTradesByRange(rangeTrades, "14d", new Date(2026, 0, 31, 12)).map((trade) => trade.id),
    ["new"],
  );

  const good = Array.from({ length: 10 }, (_, index) => makeTrade({ id: `good-${index}` }));
  const sloppy = Array.from({ length: 10 }, (_, index) =>
    makeTrade({
      id: `sloppy-${index}`,
      exit: 90,
      quantity: 1,
      stop: null,
      followedPlan: false,
      notes: "",
      lesson: "",
      entryEmotion: undefined,
      exitEmotion: undefined,
      screenshots: [],
    }),
  );
  assert.ok(santandcScore(good, 25000).score > santandcScore(sloppy, 25000).score);
  assert.ok(santandcScore(good, 25000).score <= 100);

  const asiaLosses = [0, 1, 2].map((index) =>
    makeTrade({ id: `asia-${index}`, session: "asia", exit: 90, quantity: 1, fees: 0, entryEmotion: "revenge", mistake: "Revenge trade" }),
  );
  const findings = leakFindings([...good.slice(0, 3), ...asiaLosses], presetPlaybooks(), 3);
  assert.ok(findings.some((finding) => finding.dimension === "Session" && finding.key === "Asia"));
  assert.ok(findings.some((finding) => finding.dimension === "Entry emotion" && finding.key === "Revenge"));

  const report = generateWeeklyReport(good, 25000, presetPlaybooks(), 7, new Date(2026, 0, 5, 12));
  assert.match(report.summary, /10 closes/);
  assert.match(report.markdown, /One focus next/);
  assert.ok(report.focus.length > 10);
});
