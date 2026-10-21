import { JournalInsights } from "@/components/journal/journal-insights";
import { groupTrades, planSplit, tagGroups, tradeDurationMinutes, tradePnl, type GroupStat, type PerformanceMode } from "@/lib/journal/calc";
import { dayKey, emotionLabel, formatMoney, formatPct, formatR, formatSignedPct, marketLabel, pnlClass, sessionLabel, sideLabel, todayKey } from "@/lib/journal/format";
import type { Grade, Playbook, Session, Side, Trade } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useEffect, useRef, type ReactNode } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const SESSIONS: Session[] = ["asia", "london", "overlap", "newyork", "other"];
const GRADES: Grade[] = ["A+", "A", "B", "C", "D", "F"];
const SIDES: Side[] = ["long", "short"];

function metricValue(stat: GroupStat, metric: PerformanceMode, startingBalance: number): number {
  if (metric === "r") return stat.totalR;
  if (metric === "pct") return startingBalance > 0 ? stat.net / startingBalance : 0;
  return stat.net;
}

function metricText(stat: GroupStat, metric: PerformanceMode, startingBalance: number): string {
  if (metric === "r") return formatR(stat.totalR);
  if (metric === "pct") return formatSignedPct(metricValue(stat, metric, startingBalance));
  return formatMoney(stat.net);
}

function metricMax(stats: readonly GroupStat[], metric: PerformanceMode, startingBalance: number): number {
  return Math.max(...stats.map((item) => Math.abs(metricValue(item, metric, startingBalance))), 0);
}

function Meter({ stat, max, metric = "money", startingBalance = 0 }: { stat: GroupStat; max: number; metric?: PerformanceMode; startingBalance?: number }) {
  const value = metricValue(stat, metric, startingBalance);
  const width = max === 0 ? 0 : Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm">{stat.key}</p>
        <p className={cn("font-mono text-sm tabular-nums", pnlClass(stat.net))}>{metricText(stat, metric, startingBalance)}</p>
      </div>
      <div className="mt-2 h-2 rounded-sm bg-card-2">
        <div
          className={cn("h-2 rounded-sm", stat.net > 0 ? "bg-up" : stat.net < 0 ? "bg-down" : "bg-border")}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-1 text-sm text-subtle">
        {stat.count} trades · {formatPct(stat.winRate)} · {formatR(stat.avgR)} avg
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function ordered(stats: ReturnType<typeof groupTrades>, keys: string[], label: (key: string) => string): GroupStat[] {
  return keys.map((key) => {
    const found = stats.find((item) => item.key === key);
    if (found) return { ...found, key: label(key) };
    return {
      key: label(key),
      net: 0,
      count: 0,
      wins: 0,
      winRate: null,
      totalR: 0,
      avgR: null,
      rCount: 0,
      grossProfit: 0,
      grossLoss: 0,
      profitFactor: null,
    };
  });
}

export function ReviewView({
  trades,
  onOpenDay,
  playbooks = [],
  startingBalance = 0,
  metric = "money",
}: {
  trades: Trade[];
  onOpenDay: (day: string) => void;
  playbooks?: Playbook[];
  startingBalance?: number;
  metric?: PerformanceMode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [trades.length]);

  if (trades.length === 0) {
    return <p className="text-sm text-muted">Log a few closes and the review fills in.</p>;
  }

  const plan = planSplit(trades);
  const setups = groupTrades(trades, (t) => t.setup || "No setup").sort((a, b) => b.net - a.net);
  const setupMax = metricMax(setups, metric, startingBalance);
  const symbols = groupTrades(trades, (t) => t.symbol).sort(
    (a, b) => Math.abs(b.net) - Math.abs(a.net),
  );
  const symbolMax = metricMax(symbols.slice(0, 6), metric, startingBalance);
  const weekdays = ordered(
    groupTrades(trades, (t) => String((new Date(t.closedAt).getDay() + 6) % 7)),
    WEEKDAYS.map((_, index) => String(index)),
    (key) => WEEKDAYS[Number(key)],
  );
  const weekdayMax = metricMax(weekdays, metric, startingBalance);
  const sessions = ordered(groupTrades(trades, (t) => t.session), SESSIONS, (key) =>
    sessionLabel(key as Session),
  );
  const sessionMax = metricMax(sessions, metric, startingBalance);
  const sides = ordered(groupTrades(trades, (t) => t.side), SIDES, (key) => sideLabel(key as Side));
  const sideMax = metricMax(sides, metric, startingBalance);
  const grades = ordered(groupTrades(trades, (t) => t.grade), GRADES, (key) => `Grade ${key}`);
  const gradeMax = metricMax(grades, metric, startingBalance);
  const tags = tagGroups(trades);
  const tagMax = metricMax(tags, metric, startingBalance);

  const sortGroups = (keyOf: (trade: Trade) => string) => groupTrades(trades, keyOf).sort((a, b) => b.net - a.net);
  const playbookName = (trade: Trade) => playbooks.find((item) => item.id === trade.playbookId)?.name ?? trade.setup ?? "No playbook";
  const extraGroups: { title: string; stats: GroupStat[] }[] = [
    { title: "By playbook", stats: sortGroups(playbookName) },
    { title: "By account", stats: sortGroups((t) => t.account?.trim() || "Main") },
    { title: "By market", stats: sortGroups((t) => marketLabel(t.market)) },
    { title: "By timeframe", stats: sortGroups((t) => t.timeframe || "Untagged") },
    { title: "Entry emotion", stats: sortGroups((t) => (t.entryEmotion ? emotionLabel(t.entryEmotion) : "Untagged")) },
    { title: "Exit emotion", stats: sortGroups((t) => (t.exitEmotion ? emotionLabel(t.exitEmotion) : "Untagged")) },
    { title: "By mistake", stats: sortGroups((t) => t.mistake?.trim() || "None recorded") },
    { title: "By confidence", stats: sortGroups((t) => (t.confidence ? `${t.confidence}/5` : "Untagged")) },
    { title: "By opening hour", stats: groupTrades(trades, (t) => `${String(new Date(t.openedAt).getHours()).padStart(2, "0")}:00`).sort((a, b) => a.key.localeCompare(b.key)) },
    { title: "By holding time", stats: sortGroups((t) => {
      const minutes = tradeDurationMinutes(t);
      if (minutes == null) return "Unknown";
      if (minutes < 15) return "Under 15m";
      if (minutes < 60) return "15–60m";
      if (minutes < 240) return "1–4h";
      if (minutes < 1440) return "4–24h";
      return "Over 1d";
    }) },
  ];

  const byDay = new Map<string, number>();
  for (const trade of trades) {
    const key = dayKey(trade.closedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + tradePnl(trade));
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - mondayOffset);
  const weeks = 13;
  const start = new Date(thisMonday);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const todayId = todayKey();
  const columns: { key: string; pnl: number | null; future: boolean; label: string }[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const days = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = format(date, "yyyy-MM-dd");
      const future = key > todayId;
      days.push({
        key,
        pnl: future ? null : (byDay.get(key) ?? null),
        future,
        label: format(date, "EEE MMM d"),
      });
    }
    columns.push(days);
  }

  return (
    <div className="grid gap-3">
      <JournalInsights trades={trades} playbooks={playbooks} startingBalance={startingBalance} onOpenDay={onOpenDay} />
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted">Daily result</h2>
          <div ref={scroller} className="mt-4 overflow-x-auto">
            <div className="flex w-max gap-1">
              <div className="sticky left-0 z-10 flex shrink-0 flex-col gap-1 bg-card pr-1">
                {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
                  <div key={`${label}-${index}`} className="flex h-11 w-4 items-center text-xs text-subtle">
                    {label}
                  </div>
                ))}
              </div>
              {columns.map((week) => (
                <div key={week[0].key} className="flex flex-col gap-1">
                  {week.map((day) => {
                    const traded = day.pnl != null && byDay.has(day.key);
                    return (
                      <button
                        key={day.key}
                        type="button"
                        disabled={day.future || !traded}
                        onClick={() => onOpenDay(day.key)}
                        aria-label={
                          day.future
                            ? `${day.label}, ahead`
                            : traded
                              ? `${day.label}, ${formatMoney(day.pnl ?? 0)}`
                              : `${day.label}, no trades`
                        }
                        className={cn(
                          "size-11 rounded-sm",
                          day.future && "border border-border bg-transparent",
                          !day.future && !traded && "bg-card-2",
                          traded && (day.pnl ?? 0) > 0 && "bg-up",
                          traded && (day.pnl ?? 0) < 0 && "bg-down",
                          traded && day.pnl === 0 && "bg-border",
                          day.key === todayId && "ring-2 ring-accent",
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm text-subtle">Last 13 weeks. A filled day opens that book.</p>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted">Plan</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="text-sm text-muted">Followed</p>
              <p className={cn("mt-1 font-mono text-2xl font-medium tabular-nums", pnlClass(plan.on.net))}>
                {formatMoney(plan.on.net)}
              </p>
              <p className="mt-1 text-sm text-subtle">
                {plan.on.count} trades · {formatPct(plan.on.winRate)} wins
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Broke</p>
              <p className={cn("mt-1 font-mono text-2xl font-medium tabular-nums", pnlClass(plan.off.net))}>
                {formatMoney(plan.off.net)}
              </p>
              <p className="mt-1 text-sm text-subtle">
                {plan.off.count} trades · {formatPct(plan.off.winRate)} wins
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">
            The gap is the cost of trading a plan you did not actually use.
          </p>
        </section>
      </div>

      <Panel title="By setup">
        {setups.map((stat) => (
          <Meter key={stat.key} stat={stat} max={setupMax} metric={metric} startingBalance={startingBalance} />
        ))}
      </Panel>
      <Panel title="By symbol">
        {symbols.slice(0, 6).map((stat) => (
          <Meter key={stat.key} stat={stat} max={symbolMax} metric={metric} startingBalance={startingBalance} />
        ))}
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Weekday">
          {weekdays.map((stat) => (
            <Meter key={stat.key} stat={stat} max={weekdayMax} metric={metric} startingBalance={startingBalance} />
          ))}
        </Panel>
        <Panel title="Session">
          {sessions.map((stat) => (
            <Meter key={stat.key} stat={stat} max={sessionMax} metric={metric} startingBalance={startingBalance} />
          ))}
        </Panel>
        <Panel title="Side">
          {sides.map((stat) => (
            <Meter key={stat.key} stat={stat} max={sideMax} metric={metric} startingBalance={startingBalance} />
          ))}
        </Panel>
        <Panel title="Grade">
          {grades.map((stat) => (
            <Meter key={stat.key} stat={stat} max={gradeMax} metric={metric} startingBalance={startingBalance} />
          ))}
        </Panel>
      </div>
      {tags.length ? (
        <Panel title="Tagged leaks">
          {tags.map((stat) => (
            <Meter key={stat.key} stat={stat} max={tagMax} metric={metric} startingBalance={startingBalance} />
          ))}
          <p className="text-sm text-subtle">
            A trade counts under every tag it carries, so these rows can overlap.
          </p>
        </Panel>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {extraGroups.map((group) => {
          const max = metricMax(group.stats, metric, startingBalance);
          return (
            <Panel key={group.title} title={group.title}>
              {group.stats.map((stat) => (
                <Meter key={stat.key} stat={stat} max={max} metric={metric} startingBalance={startingBalance} />
              ))}
            </Panel>
          );
        })}
      </div>

    </div>
  );
}
