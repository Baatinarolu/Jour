import { matchesQuery, tradePnl, tradeR } from "@/lib/journal/calc";
import {
  formatDay,
  formatMoney,
  formatPrice,
  formatQty,
  formatR,
  marketLabel,
  pnlClass,
  sessionLabel,
  sideLabel,
} from "@/lib/journal/format";
import type { ResultFilter, Trade, TradeQuery } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const FILTERS: { id: ResultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "wins", label: "Wins" },
  { id: "losses", label: "Losses" },
  { id: "offplan", label: "Off plan" },
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
}: {
  trades: Trade[];
  query: TradeQuery;
  onQuery: (next: TradeQuery) => void;
  onEdit: (trade: Trade) => void;
}) {
  const sorted = [...trades].sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  );
  const visible = sorted.filter((trade) => matchesQuery(trade, query));

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
                        {sideLabel(trade.side)} · {trade.setup || "No setup"} · {trade.grade}
                      </span>
                      <span className="mt-1 block text-sm text-subtle">
                        {formatDay(trade.closedAt)} · {sessionLabel(trade.session)}
                      </span>
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
                      <span className="truncate">
                        {trade.setup || "No setup"}
                        <span className="text-subtle"> · {marketLabel(trade.market)}</span>
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
