import { groupTrades, planSplit, tradePnl } from "@/lib/journal/calc";
import { dayKey, formatMoney, formatPct, pnlClass, sessionLabel, sideLabel, todayKey } from "@/lib/journal/format";
import type { Grade, Session, Side, Trade } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useEffect, useRef, type ReactNode } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const SESSIONS: Session[] = ["asia", "london", "newyork", "other"];
const GRADES: Grade[] = ["A", "B", "C", "F"];
const SIDES: Side[] = ["long", "short"];

function Meter({ stat, max }: { stat: { key: string; net: number; count: number; winRate: number | null }; max: number }) {
  const width = max === 0 ? 0 : Math.min(100, (Math.abs(stat.net) / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm">{stat.key}</p>
        <p className={cn("font-mono text-sm tabular-nums", pnlClass(stat.net))}>{formatMoney(stat.net)}</p>
      </div>
      <div className="mt-2 h-2 rounded-sm bg-card-2">
        <div
          className={cn("h-2 rounded-sm", stat.net > 0 ? "bg-up" : stat.net < 0 ? "bg-down" : "bg-border")}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-1 text-sm text-subtle">
        {stat.count} trades · {formatPct(stat.winRate)}
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

function ordered(stats: ReturnType<typeof groupTrades>, keys: string[], label: (key: string) => string) {
  return keys.map((key) => {
    const found = stats.find((item) => item.key === key);
    return {
      key: label(key),
      net: found?.net ?? 0,
      count: found?.count ?? 0,
      winRate: found?.winRate ?? null,
    };
  });
}

export function ReviewView({
  trades,
  onOpenDay,
}: {
  trades: Trade[];
  onOpenDay: (day: string) => void;
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
  const setupMax = Math.max(...setups.map((item) => Math.abs(item.net)), 0);
  const symbols = groupTrades(trades, (t) => t.symbol).sort(
    (a, b) => Math.abs(b.net) - Math.abs(a.net),
  );
  const symbolMax = Math.max(...symbols.slice(0, 6).map((item) => Math.abs(item.net)), 0);
  const weekdays = ordered(
    groupTrades(trades, (t) => format(new Date(t.closedAt), "EEE")),
    [...WEEKDAYS],
    (key) => key,
  );
  const weekdayMax = Math.max(...weekdays.map((item) => Math.abs(item.net)), 0);
  const sessions = ordered(groupTrades(trades, (t) => t.session), SESSIONS, (key) =>
    sessionLabel(key as Session),
  );
  const sessionMax = Math.max(...sessions.map((item) => Math.abs(item.net)), 0);
  const sides = ordered(groupTrades(trades, (t) => t.side), SIDES, (key) => sideLabel(key as Side));
  const sideMax = Math.max(...sides.map((item) => Math.abs(item.net)), 0);
  const grades = ordered(groupTrades(trades, (t) => t.grade), GRADES, (key) => `Grade ${key}`);
  const gradeMax = Math.max(...grades.map((item) => Math.abs(item.net)), 0);
  const tags = groupTrades(
    trades.filter((t) => t.tags.length),
    (t) => t.tags[0] ?? "",
  ).sort((a, b) => a.net - b.net);
  const tagMax = Math.max(...tags.map((item) => Math.abs(item.net)), 0);

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
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted">Daily result</h2>
          <div ref={scroller} className="mt-4 overflow-x-auto">
            <div className="flex w-max gap-1">
              <div className="flex flex-col gap-1 pr-1">
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
          <Meter key={stat.key} stat={stat} max={setupMax} />
        ))}
      </Panel>
      <Panel title="By symbol">
        {symbols.slice(0, 6).map((stat) => (
          <Meter key={stat.key} stat={stat} max={symbolMax} />
        ))}
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Weekday">
          {weekdays.map((stat) => (
            <Meter key={stat.key} stat={stat} max={weekdayMax} />
          ))}
        </Panel>
        <Panel title="Session">
          {sessions.map((stat) => (
            <Meter key={stat.key} stat={stat} max={sessionMax} />
          ))}
        </Panel>
        <Panel title="Side">
          {sides.map((stat) => (
            <Meter key={stat.key} stat={stat} max={sideMax} />
          ))}
        </Panel>
        <Panel title="Grade">
          {grades.map((stat) => (
            <Meter key={stat.key} stat={stat} max={gradeMax} />
          ))}
        </Panel>
      </div>
      {tags.length ? (
        <Panel title="Tagged leaks">
          {tags.map((stat) => (
            <Meter key={stat.key} stat={stat} max={tagMax} />
          ))}
        </Panel>
      ) : null}
    </div>
  );
}
