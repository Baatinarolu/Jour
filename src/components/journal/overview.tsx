import { EquityChart } from "@/components/journal/equity-chart";
import { Button } from "@/components/ui/button";
import { buildEquity, journalStats, planSplit, tradePnl, tradeR } from "@/lib/journal/calc";
import {
  formatDay,
  formatFactor,
  formatMoney,
  formatPct,
  formatR,
  pnlClass,
  sideLabel,
  todayKey,
} from "@/lib/journal/format";
import type { Rule, Trade } from "@/lib/journal/types";

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-mono text-xl font-medium tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-subtle">{hint}</p>
    </div>
  );
}

function streakCopy(kind: "win" | "loss" | "none", count: number): string {
  if (kind === "none" || count === 0) return "No streak yet";
  if (count === 1) return kind === "win" ? "Last close was a winner" : "Last close was a loss";
  return kind === "win" ? `${count} winners in a row` : `${count} losses in a row`;
}

export function Overview({
  trades,
  rules,
  checks,
  startingBalance,
  onCreate,
  onEdit,
  onReviewRules,
}: {
  trades: Trade[];
  rules: Rule[];
  checks: Record<string, string[]>;
  startingBalance: number;
  onCreate: () => void;
  onEdit: (trade: Trade) => void;
  onReviewRules: () => void;
}) {
  const stats = journalStats(trades, startingBalance);
  const equity = buildEquity(trades, startingBalance);
  const plan = planSplit(trades);
  const recent = [...trades].sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  );
  const today = todayKey();
  const honored = (checks[today] ?? []).filter((id) => rules.some((rule) => rule.id === id)).length;

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-medium tracking-tight">The book is empty</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Log a closed trade, or load the sample book from settings to see how a review reads.
          Nothing is uploaded. It stays in this browser.
        </p>
        <Button className="mt-5" onClick={onCreate}>
          Log a trade
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted">Closed P&L</p>
      <p className={`mt-2 font-mono text-4xl font-medium tabular-nums tracking-tight md:text-5xl ${pnlClass(stats.net)}`}>
        {formatMoney(stats.net)}
      </p>
      <p className="mt-2 text-sm text-muted">
        {stats.count} closed
        {stats.firstAt && stats.lastAt ? ` · ${formatDay(stats.firstAt)} – ${formatDay(stats.lastAt)}` : ""}
        {" · "}
        {streakCopy(stats.streak.kind, stats.streak.count)}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Win rate"
          value={formatPct(stats.winRate)}
          hint={stats.wins + stats.losses ? `${stats.wins} of ${stats.wins + stats.losses}` : "No decisive trades"}
        />
        <Stat
          label="Profit factor"
          value={formatFactor(stats.profitFactor)}
          hint={stats.payoff != null ? `Payoff ${stats.payoff.toFixed(2)}` : "Gross win / gross loss"}
        />
        <Stat
          label="Expectancy"
          value={stats.expectancy == null ? "—" : formatMoney(stats.expectancy)}
          hint="Average trade"
        />
        <Stat
          label="Max drawdown"
          value={stats.maxDrawdown ? formatMoney(-stats.maxDrawdown) : formatMoney(0, false)}
          hint={stats.maxDrawdownPct != null ? `${formatPct(stats.maxDrawdownPct)} of peak` : "From the equity peak"}
        />
      </div>

      <div className="mt-3">
        <EquityChart points={equity} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={onReviewRules}
          className="rounded-xl border border-border bg-card p-4 text-left lg:col-span-2"
        >
          <p className="text-sm text-muted">Today’s rules</p>
          <p className="mt-2 font-mono text-xl font-medium tabular-nums">
            {honored} of {rules.length}
          </p>
          <p className="mt-1 text-sm text-subtle">Honored so far. Open the list.</p>
        </button>
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted">On plan</p>
            <p className={`mt-2 font-mono text-xl font-medium tabular-nums ${pnlClass(plan.on.net)}`}>
              {formatMoney(plan.on.net)}
            </p>
            <p className="mt-1 text-sm text-subtle">
              {plan.on.count} trades · {formatPct(plan.on.winRate)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted">Off plan</p>
            <p className={`mt-2 font-mono text-xl font-medium tabular-nums ${pnlClass(plan.off.net)}`}>
              {formatMoney(plan.off.net)}
            </p>
            <p className="mt-1 text-sm text-subtle">
              {plan.off.count} trades · {formatPct(plan.off.winRate)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-muted">Recent closes</h2>
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {recent.slice(0, 6).map((trade) => {
            const pnl = tradePnl(trade);
            return (
              <li key={trade.id}>
                <button
                  type="button"
                  onClick={() => onEdit(trade)}
                  className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3 text-left hover:bg-card-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {trade.symbol}
                      <span className="font-normal text-muted"> · {sideLabel(trade.side)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-subtle">
                      {formatDay(trade.closedAt)} · {trade.setup || "No setup"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`block font-mono text-sm tabular-nums ${pnlClass(pnl)}`}>
                      {formatMoney(pnl)}
                    </span>
                    <span className="mt-0.5 block font-mono text-sm tabular-nums text-subtle">
                      {formatR(tradeR(trade))}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
