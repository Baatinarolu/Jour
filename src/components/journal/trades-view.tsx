import { matchesQuery, tradeDurationMinutes, tradePnl, tradeR } from "@/lib/journal/calc";
import {
  emotionLabel,
  formatDay,
  formatDuration,
  formatMoney,
  formatPrice,
  formatQty,
  formatR,
  marketLabel,
  pnlClass,
  sessionLabel,
  sideLabel,
} from "@/lib/journal/format";
import { EMOTIONS, type Playbook, type ResultFilter, type Trade, type TradeQuery } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";

const FILTERS: { id: ResultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "wins", label: "Wins" },
  { id: "losses", label: "Losses" },
  { id: "offplan", label: "Off plan" },
  { id: "breakeven", label: "Flat" },
  { id: "unreviewed", label: "Needs review" },
];

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "press h-11 shrink-0 rounded-sm px-3 text-sm",
        active ? "bg-accent text-accent-foreground" : "border border-border bg-card text-muted",
      )}
    >
      {children}
    </button>
  );
}

export function TradesView({
  trades,
  query,
  onQuery,
  onEdit,
  playbooks = [],
}: {
  trades: Trade[];
  query: TradeQuery;
  onQuery: (next: TradeQuery) => void;
  onEdit: (trade: Trade) => void;
  playbooks?: Playbook[];
}) {
  const [accountFilter, setAccountFilter] = useState("all");
  const [emotionFilter, setEmotionFilter] = useState("all");
  const [playbookFilter, setPlaybookFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  const accounts = useMemo(() => [...new Set(trades.map((trade) => trade.account?.trim() || "Main"))].sort(), [trades]);
  const visible = useMemo(() => {
    const filtered = trades.filter((trade) => {
      if (!matchesQuery(trade, query)) return false;
      if (accountFilter !== "all" && (trade.account?.trim() || "Main") !== accountFilter) return false;
      if (emotionFilter !== "all" && trade.entryEmotion !== emotionFilter) return false;
      if (playbookFilter !== "all" && trade.playbookId !== playbookFilter) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "oldest") return Date.parse(a.closedAt) - Date.parse(b.closedAt);
      if (sort === "pnl-desc") return tradePnl(b) - tradePnl(a);
      if (sort === "pnl-asc") return tradePnl(a) - tradePnl(b);
      if (sort === "r-desc") return (tradeR(b) ?? -Infinity) - (tradeR(a) ?? -Infinity);
      if (sort === "duration") return (tradeDurationMinutes(b) ?? 0) - (tradeDurationMinutes(a) ?? 0);
      return Date.parse(b.closedAt) - Date.parse(a.closedAt);
    });
  }, [accountFilter, emotionFilter, playbookFilter, query, sort, trades]);
  const visibleNet = visible.reduce((sum, trade) => sum + tradePnl(trade), 0);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query.q}
          onChange={(event) => onQuery({ ...query, q: event.target.value })}
          placeholder="Search symbol, setup, notes"
          aria-label="Search trades"
          className="h-11 w-full rounded-sm border border-border bg-card px-3 text-sm sm:max-w-xs"
        />
        <div className="flex gap-2 overflow-x-auto">
          {FILTERS.map((filter) => (
            <Chip
              key={filter.id}
              active={query.result === filter.id}
              onClick={() => onQuery({ ...query, result: filter.id })}
            >
              {filter.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} aria-label="Filter by account" className="h-11 rounded-sm border border-border bg-card px-3 text-sm">
          <option value="all">All accounts</option>
          {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
        </select>
        <select value={playbookFilter} onChange={(event) => setPlaybookFilter(event.target.value)} aria-label="Filter by playbook" className="h-11 rounded-sm border border-border bg-card px-3 text-sm">
          <option value="all">All playbooks</option>
          {playbooks.map((playbook) => <option key={playbook.id} value={playbook.id}>{playbook.name}</option>)}
        </select>
        <select value={emotionFilter} onChange={(event) => setEmotionFilter(event.target.value)} aria-label="Filter by entry emotion" className="h-11 rounded-sm border border-border bg-card px-3 text-sm">
          <option value="all">All entry emotions</option>
          {EMOTIONS.map((emotion) => <option key={emotion} value={emotion}>{emotionLabel(emotion)}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort trades" className="h-11 rounded-sm border border-border bg-card px-3 text-sm">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="pnl-desc">Highest P&L</option>
          <option value="pnl-asc">Lowest P&L</option>
          <option value="r-desc">Highest R</option>
          <option value="duration">Longest held</option>
        </select>
      </div>
      <p className="mt-3 text-sm text-subtle">
        Showing {visible.length} of {trades.length} trades · <span className={`font-mono tabular-nums ${visibleNet > 0 ? "text-up" : visibleNet < 0 ? "text-down" : "text-muted"}`}>{formatMoney(visibleNet)}</span>
      </p>
      {query.day ? (
        <div className="mt-3">
          <Chip active onClick={() => onQuery({ ...query, day: null })}>
            {`${format(parseISO(query.day), "MMM d")} · clear`}
          </Chip>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No trades match.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border lg:hidden">
            {visible.map((trade) => {
              const pnl = tradePnl(trade);
              return (
                <li key={trade.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(trade)}
                    className="flex w-full items-start justify-between gap-3 bg-card px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{trade.symbol}</span>
                      <span className="mt-1 block text-sm text-muted">
                        {sideLabel(trade.side)} · {trade.setup || "No setup"} · {trade.grade}{trade.timeframe ? ` · ${trade.timeframe}` : ""}
                      </span>
                      <span className="mt-1 block text-sm text-subtle">
                        {formatDay(trade.closedAt)} · {sessionLabel(trade.session)} · {formatDuration(tradeDurationMinutes(trade))}
                        {trade.entryEmotion ? ` · ${emotionLabel(trade.entryEmotion)}` : ""}{trade.screenshots?.length ? ` · ${trade.screenshots.length} chart${trade.screenshots.length > 1 ? "s" : ""}` : ""}
                      </span>
                      {trade.mistake ? <span className="mt-1 block truncate text-sm text-down">{trade.mistake}</span> : null}
                    </span>
                    <span className="text-right">
                      <span className={`block font-mono text-sm tabular-nums ${pnlClass(pnl)}`}>
                        {formatMoney(pnl)}
                      </span>
                      <span className="mt-1 block font-mono text-sm tabular-nums text-subtle">
                        {formatR(tradeR(trade))}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 hidden overflow-hidden rounded-xl border border-border lg:block">
            <div className="trade-grid border-b border-border px-4 py-3 text-sm text-subtle">
              <span>Date</span>
              <span>Symbol</span>
              <span>Side</span>
              <span>Setup</span>
              <span className="text-right">P&L</span>
              <span className="text-right">R</span>
            </div>
            <ul>
              {visible.map((trade) => {
                const pnl = tradePnl(trade);
                return (
                  <li key={trade.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onEdit(trade)}
                      className="trade-grid w-full bg-card px-4 py-3 text-left text-sm hover:bg-card-2"
                    >
                      <span className="text-muted">{formatDay(trade.closedAt)}</span>
                      <span>
                        <span className="block font-medium">{trade.symbol}</span>
                        <span className="block text-subtle">
                          {formatPrice(trade.entry)} → {formatPrice(trade.exit)} · {formatQty(trade.quantity)}
                        </span>
                      </span>
                      <span className="text-muted">{sideLabel(trade.side)}</span>
                      <span className="min-w-0">
                        <span className="block truncate">{trade.setup || "No setup"}<span className="text-subtle"> · {marketLabel(trade.market)}</span></span>
                        <span className="mt-0.5 block truncate text-subtle">
                          {(trade.account || "Main")} · {formatDuration(tradeDurationMinutes(trade))}{trade.entryEmotion ? ` · ${emotionLabel(trade.entryEmotion)}` : ""}{trade.screenshots?.length ? ` · ${trade.screenshots.length} chart${trade.screenshots.length > 1 ? "s" : ""}` : ""}{trade.mistake ? ` · ${trade.mistake}` : ""}
                        </span>
                      </span>
                      <span className={`text-right font-mono tabular-nums ${pnlClass(pnl)}`}>
                        {formatMoney(pnl)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-muted">
                        {formatR(tradeR(trade))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
