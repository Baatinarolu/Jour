import { TradingViewChart } from "@/components/journal/tradingview-chart";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { tradeDurationMinutes, tradePnl, tradeR } from "@/lib/journal/calc";
import {
  emotionLabel,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPrice,
  formatR,
  pnlClass,
  sideLabel,
} from "@/lib/journal/format";
import {
  inferTradingViewSymbol,
  tradingViewChartUrl,
  tradingViewInterval,
  tradingViewWatchlist,
} from "@/lib/journal/tradingview";
import { TIMEFRAMES, type Playbook, type Trade } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  List,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

type FullscreenCapableElement = HTMLDivElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function ChartView({
  trades,
  playbooks,
  onEdit,
  onCreate,
}: {
  trades: Trade[];
  playbooks: Playbook[];
  onEdit: (trade: Trade) => void;
  onCreate: () => void;
}) {
  const recent = useMemo(
    () => [...trades].sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt)),
    [trades],
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = recent.find((trade) => trade.id === selectedId) ?? recent[0] ?? null;
  const inferred = selected
    ? inferTradingViewSymbol(selected.symbol, selected.market, selected.tvSymbol)
    : "NASDAQ:AAPL";
  const [symbolDraft, setSymbolDraft] = useState(inferred);
  const [appliedSymbol, setAppliedSymbol] = useState(inferred);
  const [timeframe, setTimeframe] = useState<string>(() => {
    const journalTimeframe = selected?.timeframe;
    return journalTimeframe && (TIMEFRAMES as readonly string[]).includes(journalTimeframe)
      ? journalTimeframe
      : "5m";
  });
  const [panelOpen, setPanelOpen] = useState(true);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [chartReloadKey, setChartReloadKey] = useState(0);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const panelBeforeExpand = useRef(true);

  useEffect(() => {
    setSymbolDraft(inferred);
    setAppliedSymbol(inferred);
  }, [selected?.id, inferred]);

  useEffect(() => {
    if (!expanded) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setExpanded(false);
        setPanelOpen(panelBeforeExpand.current);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  useEffect(() => {
    const timers = [60, 280].map((delay) =>
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [expanded, panelOpen]);

  const watchlist = useMemo(() => tradingViewWatchlist(recent), [recent]);
  const externalUrl = selected
    ? tradingViewChartUrl({ ...selected, tvSymbol: appliedSymbol, timeframe })
    : `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(appliedSymbol)}&interval=${tradingViewInterval(timeframe)}`;
  const playbook = selected?.playbookId
    ? playbooks.find((item) => item.id === selected.playbookId)
    : null;
  const pnl = selected ? tradePnl(selected) : 0;

  function applySymbol() {
    setAppliedSymbol(symbolDraft.trim().toUpperCase() || inferred);
  }

  async function exitNativeFullscreen() {
    const doc = document as FullscreenCapableDocument;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    } catch {
      // The in-app expanded state below still restores the normal layout.
    }
  }

  async function collapseWorkspace() {
    setExpanded(false);
    setPanelOpen(panelBeforeExpand.current);
    await exitNativeFullscreen();
  }

  async function expandWorkspace() {
    panelBeforeExpand.current = panelOpen;
    setPanelOpen(false);
    setExpanded(true);

    const workspace = workspaceRef.current as FullscreenCapableElement | null;
    try {
      if (workspace?.requestFullscreen) await workspace.requestFullscreen();
      else if (workspace?.webkitRequestFullscreen) await workspace.webkitRequestFullscreen();
    } catch {
      // Some browsers and embedded previews block the Fullscreen API. The
      // fixed expanded layout still gives the chart the whole app viewport.
    }
  }

  async function toggleExpanded() {
    if (expanded) await collapseWorkspace();
    else await expandWorkspace();
  }

  async function editSelected() {
    if (!selected) return;
    if (expanded) await collapseWorkspace();
    onEdit(selected);
  }

  async function createTrade() {
    if (expanded) await collapseWorkspace();
    onCreate();
  }

  return (
    <div
      ref={workspaceRef}
      className={cn(
        "flex h-[calc(100dvh-6.25rem)] flex-col overflow-hidden bg-background text-foreground md:h-dvh",
        expanded && "fixed inset-0 z-40 h-dvh w-full",
      )}
    >
      <section className={cn("shrink-0 border-b border-border bg-card px-3", expanded ? "py-2" : "py-3")}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-48">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-up" />
              </span>
              <h2 className="text-base font-medium tracking-tight">Live TradingView</h2>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-muted">
              {appliedSymbol || inferred} · {timeframe}
            </p>
          </div>

          <div className="w-full sm:w-72">
            <label htmlFor="chart-trade" className="sr-only">Journal entry</label>
            <SelectField
              id="chart-trade"
              value={selected?.id ?? ""}
              disabled={!recent.length}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {recent.length ? null : <option value="">No trades yet</option>}
              {recent.map((trade) => (
                <option key={trade.id} value={trade.id}>
                  {trade.symbol} · {sideLabel(trade.side)} · {formatDateTime(trade.closedAt)}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="flex min-w-0 flex-1 gap-2 sm:min-w-80">
            <div className="min-w-0 flex-1">
              <label htmlFor="tv-symbol" className="sr-only">TradingView symbol</label>
              <TextField
                id="tv-symbol"
                value={symbolDraft}
                onChange={(event) => setSymbolDraft(event.target.value.toUpperCase())}
                onBlur={applySymbol}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applySymbol();
                }}
                placeholder="NASDAQ:NVDA, FX:EURUSD, CME_MINI:ES1!"
                autoComplete="off"
              />
            </div>
            <Button onClick={applySymbol}>Load</Button>
          </div>

          <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="group" aria-label="Chart timeframe">
            {TIMEFRAMES.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={timeframe === item}
                onClick={() => setTimeframe(item)}
                className={cn(
                  "press h-11 shrink-0 rounded-sm px-3 font-mono text-sm",
                  timeframe === item
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-background text-muted hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reload live chart"
              title="Reload live chart"
              onClick={() => setChartReloadKey((value) => value + 1)}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant={showWatchlist ? "secondary" : "ghost"}
              size="icon"
              aria-label="Toggle TradingView watchlist"
              aria-pressed={showWatchlist}
              title="Toggle TradingView watchlist (reloads the widget)"
              onClick={() => setShowWatchlist((value) => !value)}
            >
              <List className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={panelOpen ? "Hide journal panel" : "Show journal panel"}
              aria-pressed={panelOpen}
              title={panelOpen ? "Hide journal panel" : "Show journal panel"}
              onClick={() => setPanelOpen((value) => !value)}
            >
              {panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </Button>
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-border bg-card-2 px-3 text-sm font-medium"
            >
              <ExternalLink className="size-4" />
              <span className="hidden 2xl:inline">TradingView app</span>
            </a>
            {selected ? (
              <Button variant="secondary" onClick={() => void editSelected()}>
                <Pencil className="size-4" />
                <span className="hidden 2xl:inline">Edit entry</span>
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void createTrade()}>Log a trade</Button>
            )}
            <Button onClick={() => void toggleExpanded()} aria-pressed={expanded}>
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              {expanded ? "Exit full screen" : "Full screen"}
            </Button>
          </div>
        </div>

        {!expanded ? (
          <p className="mt-2 hidden text-xs text-subtle sm:block">
            Streaming TradingView chart. Feed delay depends on the exchange and symbol; the external TradingView app
            uses your TradingView account’s data permissions. Journal notes and P&L stay local.
          </p>
        ) : null}
      </section>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
        <section aria-label="Live TradingView chart" className="relative min-h-[36rem] min-w-0 flex-1 xl:min-h-0">
          <TradingViewChart
            symbol={appliedSymbol}
            interval={tradingViewInterval(timeframe)}
            watchlist={showWatchlist ? watchlist : []}
            reloadKey={chartReloadKey}
          />
        </section>

        {panelOpen ? (
          <aside className="w-full shrink-0 border-t border-border bg-background xl:h-full xl:w-[24rem] xl:overflow-y-auto xl:border-l xl:border-t-0">
            <div className="grid content-start gap-3 p-3">
              {selected ? (
                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium tracking-tight">{selected.symbol} · {sideLabel(selected.side)}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {playbook?.name ?? selected.setup ?? "No setup"}{selected.setup && playbook ? ` · ${selected.setup}` : ""}
                      </p>
                      {selected.timeframe && selected.timeframe !== timeframe ? (
                        <button
                          type="button"
                          onClick={() => setTimeframe(selected.timeframe ?? "5m")}
                          className="mt-2 text-sm text-muted underline decoration-border underline-offset-4 hover:text-foreground"
                        >
                          Use journal timeframe ({selected.timeframe})
                        </button>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className={cn("font-mono text-lg font-medium tabular-nums", pnlClass(pnl))}>{formatMoney(pnl)}</p>
                      <p className="font-mono text-sm tabular-nums text-muted">{formatR(tradeR(selected))}</p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <Detail label="Entry" value={formatPrice(selected.entry)} />
                    <Detail label="Exit" value={formatPrice(selected.exit)} />
                    <Detail label="Stop" value={selected.stop == null ? "—" : formatPrice(selected.stop)} />
                    <Detail label="Target" value={selected.target == null ? "—" : formatPrice(selected.target)} />
                    <Detail label="Opened" value={formatDateTime(selected.openedAt)} />
                    <Detail label="Closed" value={formatDateTime(selected.closedAt)} />
                    <Detail label="Held" value={formatDuration(tradeDurationMinutes(selected))} />
                    <Detail label="Account" value={selected.account || "Main"} />
                  </dl>

                  <div className="mt-4 grid gap-3 border-t border-border pt-4 text-sm">
                    <p><span className="text-subtle">Plan:</span> {selected.followedPlan ? "Followed" : "Broke the plan"}</p>
                    {selected.entryEmotion || selected.exitEmotion ? (
                      <p>
                        <span className="text-subtle">Emotion:</span>{" "}
                        {selected.entryEmotion ? emotionLabel(selected.entryEmotion) : "—"} → {selected.exitEmotion ? emotionLabel(selected.exitEmotion) : "—"}
                      </p>
                    ) : null}
                    {selected.mistake ? <p><span className="text-subtle">Mistake:</span> {selected.mistake}</p> : null}
                    {selected.entryReason ? <p><span className="text-subtle">Why in:</span> {selected.entryReason}</p> : null}
                    {selected.lesson || selected.notes ? <p><span className="text-subtle">Lesson:</span> {selected.lesson || selected.notes}</p> : null}
                  </div>

                  {selected.screenshots?.length ? (
                    <div className="mt-4 grid gap-2">
                      {selected.screenshots.map((src, index) => (
                        <img
                          key={`${selected.id}-shot-${index}`}
                          src={src}
                          alt={`Saved chart screenshot ${index + 1} for ${selected.symbol}`}
                          className="w-full rounded-sm border border-border"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-sm border border-border bg-background p-3 text-sm text-muted">
                      No saved chart yet. Use TradingView’s snapshot/camera button, then edit this entry and paste or
                      upload the image so the chart is preserved with the journal.
                    </p>
                  )}
                </section>
              ) : (
                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-medium tracking-tight">No journal entry selected</h3>
                  <p className="mt-1 text-sm text-muted">
                    The live chart still works. Log a closed trade to keep its prices and lesson beside the chart.
                  </p>
                  <Button className="mt-4" onClick={() => void createTrade()}>Log a trade</Button>
                </section>
              )}

              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-medium text-muted">Recent journal entries</h3>
                {recent.length ? (
                  <ul className="mt-3 grid gap-1">
                    {recent.slice(0, 10).map((trade) => {
                      const value = tradePnl(trade);
                      return (
                        <li key={trade.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(trade.id)}
                            aria-current={selected?.id === trade.id ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm",
                              selected?.id === trade.id ? "bg-card-2" : "hover:bg-card-2",
                            )}
                          >
                            <span className="min-w-0 truncate">{trade.symbol} <span className="text-subtle">· {trade.setup ?? "No setup"}</span></span>
                            <span className={cn("font-mono tabular-nums", pnlClass(value))}>{formatMoney(value)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted">Log a trade and it will appear here with one-click chart context.</p>
                )}
              </section>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
