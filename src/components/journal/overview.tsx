import { Button } from "@/components/ui/button";
import { buildPerformanceSeries, journalStats, planSplit, tradePnl, tradeR, type PerformanceMode } from "@/lib/journal/calc";
import {
  formatDay,
  formatFactor,
  formatSignedPct,
  formatMoney,
  formatPct,
  formatR,
  pnlClass,
  sideLabel,
  todayKey,
} from "@/lib/journal/format";
import { journalCompleteness, santandcScore } from "@/lib/journal/insights";
import type { Rule, Trade } from "@/lib/journal/types";
import { Suspense, lazy } from "react";

const EquityChart = lazy(() =>
  import("@/components/journal/equity-chart").then((module) => ({ default: module.EquityChart })),
);

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
  metric = "money",
  rangeLabel = "All time",
  filteredEmpty = false,
}: {
  trades: Trade[];
  rules: Rule[];
  checks: Record<string, string[]>;
  startingBalance: number;
  onCreate: () => void;
  onEdit: (trade: Trade) => void;
  onReviewRules: () => void;
  metric?: PerformanceMode;
  rangeLabel?: string;
  filteredEmpty?: boolean;
}) {
  const stats = journalStats(trades, startingBalance);
  const equity = buildPerformanceSeries(trades, startingBalance, metric);
  const plan = planSplit(trades);
  const recent = [...trades].sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  );
  const score = santandcScore(trades, startingBalance);
  const completeness = journalCompleteness(trades);
  const totalR = trades.reduce((sum, trade) => sum + (tradeR(trade) ?? 0), 0);
  const headline = metric === "r" ? formatR(totalR) : metric === "pct" ? formatSignedPct(startingBalance > 0 ? stats.net / startingBalance : null) : formatMoney(stats.net);
  const today = todayKey();
  const honored = (checks[today] ?? []).filter((id) => rules.some((rule) => rule.id === id)).length;

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-medium tracking-tight">{filteredEmpty ? `No closes in ${rangeLabel.toLowerCase()}` : "The book is empty"}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {filteredEmpty
            ? "Your journal has trades outside this period. Widen the analytics range above, or log the close you just took."
            : "Log a closed trade, or load the sample book from settings to see how a review reads. Nothing is uploaded. It stays in this browser."}
        </p>
        <Button className="mt-5" onClick={onCreate}>
          Log a trade
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted">{rangeLabel} · {metric === "r" ? "Total R" : metric === "pct" ? "Return" : "Closed P&L"}</p>
      <p className={`mt-2 font-mono text-4xl font-medium tabular-nums tracking-tight md:text-5xl ${pnlClass(stats.net)}`}>
        {headline}
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

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Avg R" value={formatR(stats.avgR)} hint="Trades with a stop" />
        <Stat
          label="Avg win"
          value={stats.avgWin == null ? "—" : formatMoney(stats.avgWin)}
          hint={`${stats.wins} winners`}
        />
        <Stat
          label="Avg loss"
          value={stats.avgLoss == null ? "—" : formatMoney(stats.avgLoss)}
          hint={`${stats.losses} losers${stats.scratches ? ` · ${stats.scratches} flat` : ""}`}
        />
        <Stat
          label="Gross profit"
          value={formatMoney(stats.grossProfit)}
          hint={`Gross loss ${formatMoney(stats.grossLoss)}`}
        />
      </div>

      <div className="mt-3">
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card px-6 text-center text-sm text-muted md:h-72">
              Drawing the equity curve…
            </div>
          }
        >
          <EquityChart points={equity} mode={metric} />
        </Suspense>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-muted">SANTANDC Score</h2>
              <p className="mt-1 text-sm text-subtle">Process, journal depth and results—weighted so a lucky week cannot hide bad execution.</p>
            </div>
            <p className="font-mono text-3xl font-medium tabular-nums">{score.score}<span className="text-base text-subtle">/100</span></p>
          </div>
          <p className="mt-2 text-sm">{score.label}{score.sampleFactor < 1 ? ` · ${Math.round(score.sampleFactor * 100)}% of a 50-trade sample` : ""}</p>
          <div className="mt-4 grid gap-3">
            {score.components.map((component) => (
              <div key={component.key}>
                <div className="flex justify-between gap-3 text-sm">
                  <span>{component.label}</span>
                  <span className="font-mono tabular-nums text-muted">{component.score}/{component.max}</span>
                </div>
                <div className="mt-1 h-2 rounded-sm bg-card-2">
                  <div className="h-2 rounded-sm bg-accent" style={{ width: `${component.max ? (component.score / component.max) * 100 : 0}%` }} />
                </div>
                <p className="mt-1 text-sm text-subtle">{component.detail}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted">Journal completeness</h2>
          <p className="mt-1 text-sm text-subtle">Thin records produce thin conclusions. These are the fields powering the review.</p>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div><dt className="text-sm text-muted">Defined stop</dt><dd className="mt-1 font-mono text-xl tabular-nums">{formatPct(completeness.withStop)}</dd></div>
            <div><dt className="text-sm text-muted">Target</dt><dd className="mt-1 font-mono text-xl tabular-nums">{formatPct(completeness.withTarget)}</dd></div>
            <div><dt className="text-sm text-muted">Playbook</dt><dd className="mt-1 font-mono text-xl tabular-nums">{formatPct(completeness.withPlaybook)}</dd></div>
            <div><dt className="text-sm text-muted">Emotions</dt><dd className="mt-1 font-mono text-xl tabular-nums">{formatPct(completeness.withEmotions)}</dd></div>
            <div><dt className="text-sm text-muted">Chart saved</dt><dd className="mt-1 font-mono text-xl tabular-nums">{formatPct(completeness.withScreenshot)}</dd></div>
            <div><dt className="text-sm text-muted">Lesson written</dt><dd className="mt-1 font-mono text-xl tabular-nums">{formatPct(completeness.withLesson)}</dd></div>
          </dl>
        </section>
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
