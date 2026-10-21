import { Overview } from "@/components/journal/overview";
import { RulesView } from "@/components/journal/rules-view";
import { SettingsDialog } from "@/components/journal/settings-dialog";
import { TradeDialog } from "@/components/journal/trade-dialog";
import { TradesView } from "@/components/journal/trades-view";
import { Button } from "@/components/ui/button";
import { tradePnl, type PerformanceMode } from "@/lib/journal/calc";
import { filterTradesByRange, type RangeFilter } from "@/lib/journal/insights";
import { useHydrateJournal, useJournal } from "@/lib/journal/store";
import type { JournalView, Trade, TradeQuery } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { BookOpen, ChartCandlestick, LayoutDashboard, List, Plus, Settings, SquareChartGantt } from "lucide-react";
import { Suspense, lazy, useState } from "react";

const ReviewView = lazy(() =>
  import("@/components/journal/review-view").then((module) => ({ default: module.ReviewView })),
);
const ChartView = lazy(() =>
  import("@/components/journal/chart-view").then((module) => ({ default: module.ChartView })),
);

const NAV: { id: JournalView; label: string; icon: typeof List }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "trades", label: "Trades", icon: List },
  { id: "chart", label: "Chart", icon: ChartCandlestick },
  { id: "review", label: "Review", icon: SquareChartGantt },
  { id: "rules", label: "Playbooks", icon: BookOpen },
];

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path d="M21 10.5c-.8-1.5-2.6-2.5-5-2.5-3 0-5 1.7-5 4.1 0 5.4 10 3.1 10 7.8 0 2.4-2.1 4.1-5.2 4.1-2.6 0-4.6-1.2-5.4-3" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-accent-foreground" />
    </svg>
  );
}

export function JournalApp() {
  const ready = useHydrateJournal();
  const trades = useJournal((s) => s.trades);
  const rules = useJournal((s) => s.rules);
  const checks = useJournal((s) => s.checks);
  const startingBalance = useJournal((s) => s.startingBalance);
  const sampleBanner = useJournal((s) => s.sampleBanner);
  const playbooks = useJournal((s) => s.playbooks);
  const activePlaybookId = useJournal((s) => s.activePlaybookId);
  const addTrade = useJournal((s) => s.addTrade);
  const updateTrade = useJournal((s) => s.updateTrade);
  const deleteTrade = useJournal((s) => s.deleteTrade);
  const addRule = useJournal((s) => s.addRule);
  const updateRule = useJournal((s) => s.updateRule);
  const deleteRule = useJournal((s) => s.deleteRule);
  const toggleCheck = useJournal((s) => s.toggleCheck);
  const setStartingBalance = useJournal((s) => s.setStartingBalance);
  const loadSample = useJournal((s) => s.loadSample);
  const clearTrades = useJournal((s) => s.clearTrades);
  const dismissSample = useJournal((s) => s.dismissSample);
  const replaceAll = useJournal((s) => s.replaceAll);
  const importTrades = useJournal((s) => s.importTrades);

  const [view, setView] = useState<JournalView>("overview");
  const [editing, setEditing] = useState<Trade | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState<TradeQuery>({ q: "", result: "all", day: null });
  const [range, setRange] = useState<RangeFilter>("all");
  const [metric, setMetric] = useState<PerformanceMode>("money");

  const titles: Record<JournalView, string> = {
    overview: "Overview",
    trades: "Trades",
    chart: "Chart review",
    review: "Review",
    rules: "Rules & playbooks",
  };

  const rangeLabels: Record<RangeFilter, string> = {
    today: "Today",
    week: "This week",
    "14d": "Last 14 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    all: "All time",
  };
  const filteredTrades = filterTradesByRange(trades, range);
  const accountBalance = startingBalance + trades.reduce((sum, trade) => sum + tradePnl(trade), 0);
  const accounts = [...new Set(trades.map((trade) => trade.account?.trim() || "Main"))];

  return (
    <div className="min-h-dvh bg-background text-foreground md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:px-4 md:py-6">
        <div className="flex items-center gap-3 px-2">
          <Mark />
          <div>
            <p className="text-base font-medium tracking-tight">SANTANDC</p>
            <p className="text-sm text-subtle">Private journal</p>
          </div>
        </div>
        <nav className="mt-8 grid gap-1" aria-label="Sections">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setView(item.id)}
                className={cn(
                  "press flex h-11 items-center gap-3 rounded-sm px-3 text-sm",
                  active ? "bg-card-2 text-foreground" : "text-muted hover:bg-card hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-2">
          <Button onClick={() => setEditing(null)} disabled={!ready}>
            <Plus className="size-4" />
            Log a trade
          </Button>
          <Button variant="ghost" onClick={() => setSettingsOpen(true)} disabled={!ready}>
            <Settings className="size-4" />
            Settings
          </Button>
          <p className="px-3 text-sm text-subtle">On this device</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-background md:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-2">
              <Mark />
              <p className="text-base font-medium tracking-tight">SANTANDC</p>
            </div>
            <div className="flex items-center">
              <button
                type="button"
                className="press inline-flex size-11 items-center justify-center rounded-sm text-muted"
                aria-label="Settings"
                disabled={!ready}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="size-4" />
              </button>
              <button
                type="button"
                className="press inline-flex size-11 items-center justify-center rounded-sm bg-accent text-accent-foreground"
                aria-label="Log a trade"
                disabled={!ready}
                onClick={() => setEditing(null)}
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          <nav className="grid grid-cols-5 border-t border-border" aria-label="Sections">
            {NAV.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(item.id)}
                  className={cn(
                    "h-11 text-sm",
                    active ? "text-foreground" : "text-subtle",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        <main className={cn("mx-auto w-full px-4 py-6 md:px-8 md:py-8", view === "chart" ? "max-w-[110rem]" : "max-w-5xl")}>
          <div className="mb-6 hidden items-center justify-between md:flex">
            <h1 className="text-sm font-medium text-muted">{titles[view]}</h1>
          </div>

          {!ready ? (
            <p className="text-sm text-muted">Opening your journal…</p>
          ) : (
            <>
              {sampleBanner ? (
                <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted">
                    Sample book, so the review has something to read. It is not your trading.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={clearTrades}>
                      Start fresh
                    </Button>
                    <Button variant="ghost" onClick={dismissSample}>
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : null}

              {(view === "overview" || view === "review") ? (
                <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2" aria-label="Analytics period">
                    {(Object.keys(rangeLabels) as RangeFilter[]).map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={range === item}
                        onClick={() => setRange(item)}
                        className={cn(
                          "press h-11 rounded-sm px-3 text-sm",
                          range === item ? "bg-accent text-accent-foreground" : "border border-border bg-background text-muted",
                        )}
                      >
                        {rangeLabels[item]}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2" aria-label="Performance display">
                    {([
                      ["money", "$"],
                      ["r", "R"],
                      ["pct", "%"],
                    ] as [PerformanceMode, string][]).map(([item, label]) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={metric === item}
                        onClick={() => setMetric(item)}
                        className={cn(
                          "press h-11 min-w-11 rounded-sm px-3 font-mono text-sm",
                          metric === item ? "bg-accent text-accent-foreground" : "border border-border bg-background text-muted",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {view === "overview" ? (
                <Overview
                  trades={filteredTrades}
                  metric={metric}
                  rangeLabel={rangeLabels[range]}
                  filteredEmpty={trades.length > 0 && filteredTrades.length === 0}
                  rules={rules}
                  checks={checks}
                  startingBalance={startingBalance}
                  onCreate={() => setEditing(null)}
                  onEdit={setEditing}
                  onReviewRules={() => setView("rules")}
                />
              ) : null}
              {view === "trades" ? (
                <TradesView trades={trades} query={query} onQuery={setQuery} onEdit={setEditing} playbooks={playbooks} />
              ) : null}
              {view === "chart" ? (
                <Suspense fallback={<p className="text-sm text-muted">Loading TradingView…</p>}>
                  <ChartView trades={trades} playbooks={playbooks} onEdit={setEditing} onCreate={() => setEditing(null)} />
                </Suspense>
              ) : null}
              {view === "review" ? (
                <Suspense fallback={<p className="text-sm text-muted">Loading review…</p>}>
                  <ReviewView
                    trades={filteredTrades}
                    playbooks={playbooks}
                    startingBalance={startingBalance}
                    metric={metric}
                    onOpenDay={(day) => {
                      setQuery({ ...query, day, result: "all", q: "" });
                      setView("trades");
                    }}
                  />
                </Suspense>
              ) : null}
              {view === "rules" ? (
                <RulesView
                  rules={rules}
                  checks={checks}
                  onToggle={toggleCheck}
                  onAdd={addRule}
                  onUpdate={updateRule}
                  onDelete={deleteRule}
                />
              ) : null}
            </>
          )}
        </main>
      </div>

      <TradeDialog
        open={editing !== undefined}
        trade={editing ?? null}
        setups={[...new Set(trades.map((trade) => trade.setup).filter(Boolean))]}
        playbooks={playbooks}
        activePlaybookId={activePlaybookId}
        accounts={accounts}
        accountBalance={accountBalance}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        onSave={(next) => {
          if (trades.some((item) => item.id === next.id)) updateTrade(next);
          else addTrade(next);
        }}
        onDelete={deleteTrade}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        startingBalance={startingBalance}
        backup={{
          version: 3,
          startingBalance,
          trades,
          rules,
          checks,
          sampleBanner,
          playbooks,
          activePlaybookId,
        }}
        onBalance={setStartingBalance}
        onReplace={replaceAll}
        onImportCsv={importTrades}
        onClear={clearTrades}
        onSample={loadSample}
      />
    </div>
  );
}
