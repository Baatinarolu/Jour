import assert from "node:assert/strict";
import test from "node:test";
import { parseBackup, serializeBackup } from "./backup.ts";
import { journalStats, ruleHistory, tagGroups, tradePnl, tradeR, tradeRisk } from "./calc.ts";
import { parseCsvTrades, tradesToCsv } from "./csv.ts";
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

test("legacy v1 backups are normalized to v2", () => {
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
  assert.equal(parsed.data.version, 2);
  assert.equal(parsed.data.trades.length, 1);
  assert.equal(parsed.data.trades[0]?.symbol, "AAPL");
  assert.equal(parsed.data.trades[0]?.multiplier, 1);
  assert.deepEqual(parsed.data.trades[0]?.tags, ["patient"]);
  assert.deepEqual(parsed.data.rules, [{ id: "rule-1", text: "Size down" }]);
  assert.deepEqual(parsed.data.checks, { "2026-01-02": ["rule-1"] });
});

test("v2 backups round-trip and invalid or unordered backups are rejected", () => {
  const backup = {
    version: 2 as const,
    startingBalance: 10000,
    trades: [makeTrade({ multiplier: 100 })],
    rules: [{ id: "rule-1", text: "Wait" }],
    checks: { "2026-01-02": ["rule-1"] },
    sampleBanner: false,
  };
  const roundTripped = parseBackup(serializeBackup(backup));
  assert.equal(roundTripped.ok, true);
  if (roundTripped.ok) assert.equal(roundTripped.data.trades[0]?.multiplier, 100);

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

test("CSV export and import round-trip quoted notes and tags", () => {
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
    "ES,Futures,Long,2026-01-02,2026-01-02,5000,5010,2,4,Opening drive,patient; level",
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
