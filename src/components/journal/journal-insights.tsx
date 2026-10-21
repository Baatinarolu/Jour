import { Button } from "@/components/ui/button";
import { groupTrades, journalStats, tradePnl } from "@/lib/journal/calc";
import { dayKey, formatMoney, formatPct, formatR, pnlClass } from "@/lib/journal/format";
import {
  bestConditions,
  generateWeeklyReport,
  leakFindings,
  rollingComparison,
  santandcScore,
} from "@/lib/journal/insights";
import type { Playbook, Trade } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMemo, useState } from "react";

function downloadText(filename: string, text: string, type = "text/markdown") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function StatLine({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="min-w-0">
        <span className="block truncate text-sm">{label}</span>
        {hint ? <span className="block text-sm text-subtle">{hint}</span> : null}
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function JournalInsights({
  trades,
  playbooks,
  startingBalance,
  onOpenDay,
  onOpenWeeklyReview,
}: {
  trades: Trade[];
  playbooks: Playbook[];
  startingBalance: number;
  onOpenDay: (day: string) => void;
  onOpenWeeklyReview?: () => void;
}) {
  const [reportDays, setReportDays] = useState<7 | 30 | 90>(7);
  const [selectedLeak, setSelectedLeak] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const leaks = useMemo(() => leakFindings(trades, playbooks, 3), [trades, playbooks]);
  const best = useMemo(() => bestConditions(trades, 3), [trades]);
  const report = useMemo(
    () => generateWeeklyReport(trades, startingBalance, playbooks, reportDays),
    [trades, startingBalance, playbooks, reportDays],
  );
  const rolling = useMemo(() => rollingComparison(trades, startingBalance, 20), [trades, startingBalance]);
  const score = useMemo(() => santandcScore(trades, startingBalance), [trades, startingBalance]);
  const activeLeak = leaks[Math.min(selectedLeak, Math.max(leaks.length - 1, 0))] ?? null;
  const withoutLeak = useMemo(() => {
    if (!activeLeak) return null;
    const excluded = new Set(activeLeak.tradeIds);
    return journalStats(trades.filter((trade) => !excluded.has(trade.id)), startingBalance);
  }, [activeLeak, trades, startingBalance]);
  const allStats = useMemo(() => journalStats(trades, startingBalance), [trades, startingBalance]);

  const month = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + monthOffset);
    date.setHours(12, 0, 0, 0);
    return date;
  }, [monthOffset]);
  const calendar = useMemo(() => {
    const byDay = new Map<string, { net: number; count: number }>();
    for (const trade of trades) {
      const key = dayKey(trade.closedAt);
      const current = byDay.get(key) ?? { net: 0, count: 0 };
      current.net += tradePnl(trade);
      current.count += 1;
      byDay.set(key, current);
    }
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1, 12);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = format(date, "yyyy-MM-dd");
      return { date, key, inMonth: date.getMonth() === monthIndex, ...(byDay.get(key) ?? { net: 0, count: 0 }) };
    });
  }, [month, trades]);

  const weekly = useMemo(() => {
    const groups = groupTrades(trades, (trade) => {
      const date = new Date(trade.closedAt);
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return format(date, "yyyy-MM-dd");
    });
    return groups.sort((a, b) => b.key.localeCompare(a.key)).slice(0, 8);
  }, [trades]);
  const monthly = useMemo(
    () => groupTrades(trades, (trade) => format(new Date(trade.closedAt), "yyyy-MM")).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 6),
    [trades],
  );

  return (
    <div className="grid gap-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-medium tracking-tight">Smart journal review</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              A local, deterministic report from your own entries—patterns and one focus, with no trade data sent to an AI service.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([7, 30, 90] as const).map((days) => (
              <Button key={days} size="sm" variant={reportDays === days ? "primary" : "secondary"} onClick={() => setReportDays(days)}>
                {days}d
              </Button>
            ))}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadText(`santandc-review-${format(new Date(), "yyyy-MM-dd")}.md`, report.markdown)}
            >
              Download report
            </Button>
            {onOpenWeeklyReview ? (
              <Button size="sm" variant="secondary" onClick={onOpenWeeklyReview}>
                Guided weekly review
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-4 text-sm leading-6">{report.summary}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-sm border border-border bg-background p-3">
            <p className="text-sm text-muted">Score</p>
            <p className="mt-1 font-mono text-2xl tabular-nums">{score.score}/100</p>
            <p className="mt-1 text-sm text-subtle">{score.label}</p>
          </div>
          <div className="rounded-sm border border-border bg-background p-3 md:col-span-2">
            <p className="text-sm text-muted">One focus</p>
            <p className="mt-1 text-sm leading-6">{report.focus}</p>
          </div>
        </div>
        {report.strengths.length ? (
          <ul className="mt-4 grid gap-2 text-sm text-muted">
            {report.strengths.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted">Leak detector & what-if</h2>
          {leaks.length ? (
            <>
              <div className="mt-3 grid gap-2">
                {leaks.slice(0, 6).map((leak, index) => (
                  <button
                    key={`${leak.dimension}-${leak.key}`}
                    type="button"
                    onClick={() => setSelectedLeak(index)}
                    aria-pressed={activeLeak === leak}
                    className={cn("rounded-sm border px-3 py-2 text-left", activeLeak === leak ? "border-accent bg-card-2" : "border-border bg-background")}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{leak.dimension}: {leak.key}</span>
                      <span className={cn("font-mono text-sm tabular-nums", pnlClass(leak.net))}>{formatMoney(leak.net)}</span>
                    </span>
                    <span className="mt-1 block text-sm text-subtle">{leak.count} trades · {formatR(leak.avgR)} avg R · {formatPct(leak.winRate)} wins</span>
                  </button>
                ))}
              </div>
              {activeLeak && withoutLeak ? (
                <div className="mt-4 rounded-sm border border-border bg-background p-3">
                  <p className="text-sm leading-6">{activeLeak.action}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div><dt className="text-xs text-subtle">Actual net</dt><dd className={cn("mt-1 font-mono text-sm tabular-nums", pnlClass(allStats.net))}>{formatMoney(allStats.net)}</dd></div>
                    <div><dt className="text-xs text-subtle">Without leak</dt><dd className={cn("mt-1 font-mono text-sm tabular-nums", pnlClass(withoutLeak.net))}>{formatMoney(withoutLeak.net)}</dd></div>
                    <div><dt className="text-xs text-subtle">Difference</dt><dd className="mt-1 font-mono text-sm tabular-nums">{formatMoney(withoutLeak.net - allStats.net)}</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-subtle">What-if removes those historical trades only; it does not predict the same saving in future.</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">No negative group has at least three trades yet. Tag playbook, session, emotions and mistakes consistently so leaks cannot hide inside averages.</p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted">Best measured conditions</h2>
          {best.length ? (
            <div className="mt-2">
              {best.map((item) => (
                <StatLine
                  key={`${item.dimension}-${item.key}`}
                  label={`${item.dimension}: ${item.key}`}
                  hint={`${item.count} trades · ${formatPct(item.winRate)} wins`}
                  value={`${formatMoney(item.net)} · ${formatR(item.avgR)}`}
                />
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-muted">No positive condition has a three-trade sample yet.</p>}
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-sm font-medium text-muted">Last 20 vs prior 20</h3>
            <StatLine label="Latest block" hint={`${rolling.latestCount} trades`} value={`${formatMoney(rolling.latest.net)} · ${formatR(rolling.latest.avgR)}`} />
            <StatLine label="Prior block" hint={rolling.prior ? `${rolling.priorCount} trades` : "Not enough history"} value={rolling.prior ? `${formatMoney(rolling.prior.net)} · ${formatR(rolling.prior.avgR)}` : "—"} />
          </div>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="rounded-xl border border-border bg-card p-4 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted">{format(month, "MMMM yyyy")}</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setMonthOffset((value) => value - 1)}>Prev</Button>
              <Button size="sm" variant="secondary" disabled={monthOffset >= 0} onClick={() => setMonthOffset((value) => Math.min(0, value + 1))}>Next</Button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-subtle">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendar.map((day) => (
              <button
                key={day.key}
                type="button"
                disabled={!day.count}
                onClick={() => onOpenDay(day.key)}
                className={cn(
                  "min-h-16 rounded-sm border border-border p-1.5 text-left align-top",
                  !day.inMonth && "opacity-35",
                  day.count && day.net > 0 && "bg-up/15",
                  day.count && day.net < 0 && "bg-down/15",
                  !day.count && "bg-background",
                )}
                aria-label={`${format(day.date, "MMMM d")}${day.count ? `, ${formatMoney(day.net)}, ${day.count} trades` : ", no trades"}`}
              >
                <span className="block text-xs text-muted">{day.date.getDate()}</span>
                {day.count ? (
                  <>
                    <span className={cn("mt-1 block truncate font-mono text-[11px] tabular-nums", pnlClass(day.net))}>{formatMoney(day.net)}</span>
                    <span className="block text-[11px] text-subtle">{day.count} trades</span>
                  </>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted">Weekly & monthly rhythm</h2>
          <h3 className="mt-4 text-sm text-subtle">Recent weeks</h3>
          <div>
            {weekly.map((item) => (
              <StatLine key={item.key} label={format(new Date(`${item.key}T12:00:00`), "MMM d")} hint={`${item.count} trades · ${formatPct(item.winRate)}`} value={formatMoney(item.net)} />
            ))}
          </div>
          <h3 className="mt-4 text-sm text-subtle">Recent months</h3>
          <div>
            {monthly.map((item) => (
              <StatLine key={item.key} label={format(new Date(`${item.key}-02T12:00:00`), "MMMM yyyy")} hint={`${item.count} trades · ${formatR(item.avgR)} avg`} value={formatMoney(item.net)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
