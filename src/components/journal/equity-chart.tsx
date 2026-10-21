import type { PerformanceMode, PerformancePoint } from "@/lib/journal/calc";
import { formatMoney, formatR, formatSignedPct } from "@/lib/journal/format";
import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function valueText(value: number, mode: PerformanceMode): string {
  if (mode === "r") return formatR(value);
  if (mode === "pct") return formatSignedPct(value);
  return formatMoney(value, false);
}

function dayText(value: number, mode: PerformanceMode): string {
  if (mode === "r") return `${formatR(value)} day`;
  if (mode === "pct") return `${formatSignedPct(value)} day`;
  return `${formatMoney(value)} day`;
}

function Tip({
  active,
  payload,
  mode = "money",
}: {
  active?: boolean;
  payload?: { payload: PerformancePoint }[];
  mode?: PerformanceMode;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-sm border border-border bg-card px-3 py-2">
      <p className="text-sm text-muted">{point.key === "start" ? "Start" : point.label}</p>
      <p className="font-mono text-sm tabular-nums">{valueText(point.value, mode)}</p>
      {point.key !== "start" ? (
        <p className="font-mono text-sm tabular-nums text-muted">{dayText(point.dayValue, mode)}</p>
      ) : null}
    </div>
  );
}

function ChartInner({ points, mode }: { points: PerformancePoint[]; mode: PerformanceMode }) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, mode === "money" ? 1 : 0.1);
  const pad = span * 0.22;
  const domain: [number, number] = [min - pad, max + pad];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          minTickGap={28}
          tick={{ fill: "var(--color-muted)", fontSize: 12 }}
        />
        <YAxis
          domain={domain}
          axisLine={false}
          tickLine={false}
          width={56}
          tickCount={4}
          tickFormatter={(value: number) =>
            mode === "money"
              ? value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 0 })
              : mode === "r"
                ? `${value.toFixed(1)}R`
                : `${(value * 100).toFixed(0)}%`
          }
          tick={{ fill: "var(--color-muted)", fontSize: 12, fontFamily: "IBM Plex Mono" }}
        />
        <Tooltip content={<Tip mode={mode} />} cursor={{ stroke: "var(--color-border)" }} />
        <Area
          type="monotone"
          dataKey="value"
          isAnimationActive={false}
          baseValue={domain[0]}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          fill="var(--color-accent)"
          fillOpacity={0.12}
          dot={false}
          activeDot={{ r: 3, fill: "var(--color-accent)", stroke: "var(--color-background)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function EquityChart({ points, mode = "money" }: { points: PerformancePoint[]; mode?: PerformanceMode }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(true), []);

  if (points.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card px-6 text-center text-sm text-muted md:h-72">
        Two closed trades draw the performance curve.
      </div>
    );
  }

  return (
    <div className="flex h-64 flex-col rounded-xl border border-border bg-card p-4 md:h-72">
      <p className="text-sm text-muted">{mode === "money" ? "Equity" : mode === "r" ? "Cumulative R" : "Return on starting balance"}</p>
      <div className="mt-3 min-h-0 flex-1">{show ? <ChartInner points={points} mode={mode} /> : null}</div>
    </div>
  );
}
