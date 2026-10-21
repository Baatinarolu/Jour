import { TradingViewChart } from "@/components/journal/tradingview-chart";
import { Button } from "@/components/ui/button";
import { FieldLabel, SelectField, TextField } from "@/components/ui/field";
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
import { ExternalLink, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

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
  const [timeframe, setTimeframe] = useState(selected?.timeframe || "1D");

  useEffect(() => {
    setSymbolDraft(inferred);
    setAppliedSymbol(inferred);
    setTimeframe(selected?.timeframe || "1D");
  }, [selected?.id, selected?.timeframe, inferred]);

  const watchlist = useMemo(() => tradingViewWatchlist(recent), [recent]);
  const externalUrl = selected
    ? tradingViewChartUrl({ ...selected, tvSymbol: appliedSymbol, timeframe })
    : `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(appliedSymbol)}&interval=${tradingViewInterval(timeframe)}`;
  const playbook = selected?.playbookId
    ? playbooks.find((item) => item.id === selected.playbookId)
    : null;
  const pnl = selected ? tradePnl(selected) : 0;

  return (
    <div className="grid gap-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium tracking-tight">TradingView chart review</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Your journal stays local. TradingView only receives the symbol and interval needed to draw its chart—not
              your notes, screenshots, size or P&L.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-border bg-card-2 px-4 text-sm font-medium"
            >
              <ExternalLink className="size-4" />
              Open in TradingView
            </a>
            {selected ? (
              <Button variant="secondary" onClick={() => onEdit(selected)}>
                <Pencil className="size-4" />
                Edit journal entry
              </Button>
            ) : (
              <Button onClick={onCreate}>Log a trade</Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_10rem_auto]">
          <div>
            <FieldLabel htmlFor="chart-trade">Journal entry</FieldLabel>
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
          <div>
            <FieldLabel htmlFor="tv-symbol">TradingView symbol</FieldLabel>
            <TextField
              id="tv-symbol"
              value={symbolDraft}
              onChange={(event) => setSymbolDraft(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") setAppliedSymbol(symbolDraft.trim().toUpperCase());
              }}
              placeholder="NASDAQ:NVDA, FX:EURUSD, CME_MINI:ES1!"
              autoComplete="off"
            />
          </div>
          <div>
            <FieldLabel htmlFor="tv-interval">Timeframe</FieldLabel>
            <SelectField id="tv-interval" value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
              {TIMEFRAMES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </SelectField>
          </div>
          <Button className="self-end" onClick={() => setAppliedSymbol(symbolDraft.trim().toUpperCase())}>
            Load chart
          </Button>
        </div>
        <p className="mt-2 text-sm text-subtle">
          Inferred from the entry: <span className="font-mono text-muted">{inferred}</span>. Save an exact TV symbol in
          the trade form when your broker shorthand differs.
        </p>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_22rem]">
        <section className="h-[34rem] overflow-hidden rounded-xl border border-border bg-background xl:h-[44rem]">
          <TradingViewChart
            symbol={appliedSymbol}
            interval={tradingViewInterval(timeframe)}
            watchlist={watchlist}
          />
        </section>

        <aside className="grid content-start gap-3">
          {selected ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium tracking-tight">{selected.symbol} · {sideLabel(selected.side)}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {playbook?.name ?? selected.setup ?? "No setup"}{selected.setup && playbook ? ` · ${selected.setup}` : ""}
                  </p>
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
                  No saved chart yet. Use TradingView’s snapshot/camera button, then edit this entry and paste or upload
                  the image so the chart is preserved with the journal.
                </p>
              )}
            </section>
          ) : null}

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
        </aside>
      </div>
    </div>
  );
}
