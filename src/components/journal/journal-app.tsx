import { Overview } from "@/components/journal/overview";
import { RulesView } from "@/components/journal/rules-view";
import { SettingsDialog } from "@/components/journal/settings-dialog";
import { TradeDialog } from "@/components/journal/trade-dialog";
import { TradesView } from "@/components/journal/trades-view";
import { Button } from "@/components/ui/button";
import { useHydrateJournal, useJournal } from "@/lib/journal/store";
import type { JournalView, Trade, TradeQuery } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { BookOpen, LayoutDashboard, List, Plus, Settings, SquareChartGantt } from "lucide-react";
import { Suspense, lazy, useState } from "react";

const ReviewView = lazy(() =>
  import("@/components/journal/review-view").then((module) => ({ default: module.ReviewView })),
);

const NAV: { id: JournalView; label: string; icon: typeof List }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "trades", label: "Trades", icon: List },
  { id: "review", label: "Review", icon: SquareChartGantt },
  { id: "rules", label: "Rules", icon: BookOpen },
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

  const titles: Record<JournalView, string> = {
    overview: "Overview",
    trades: "Trades",
    review: "Review",
    rules: "Rules",
  };

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
          <nav className="grid grid-cols-4 border-t border-border" aria-label="Sections">
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

        <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
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

              {view === "overview" ? (
                <Overview
                  trades={trades}
                  rules={rules}
                  checks={checks}
                  startingBalance={startingBalance}
                  onCreate={() => setEditing(null)}
                  onEdit={setEditing}
                  onReviewRules={() => setView("rules")}
                />
              ) : null}
              {view === "trades" ? (
                <TradesView trades={trades} query={query} onQuery={setQuery} onEdit={setEditing} />
              ) : null}
              {view === "review" ? (
                <Suspense fallback={<p className="text-sm text-muted">Loading review…</p>}>
                  <ReviewView
                    trades={trades}
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
          version: 2,
          startingBalance,
          trades,
          rules,
          checks,
          sampleBanner,
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
