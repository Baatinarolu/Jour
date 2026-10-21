import { formatMoney } from "@/lib/journal/format";
import type { EquityPoint } from "@/lib/journal/calc";
import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function Tip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: EquityPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-sm border border-border bg-card px-3 py-2">
      <p className="text-sm text-muted">{point.key === "start" ? "Start" : point.label}</p>
      <p className="font-mono text-sm tabular-nums">{formatMoney(point.equity, false)}</p>
      {point.key !== "start" ? (
        <p className="font-mono text-sm tabular-nums text-muted">{formatMoney(point.dayPnl)} day</p>
      ) : null}
    </div>
  );
}

function ChartInner({ points }: { points: EquityPoint[] }) {
  const values = points.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
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
          width={52}
          tickCount={4}
          tickFormatter={(value: number) =>
            value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 0 })
          }
          tick={{ fill: "var(--color-muted)", fontSize: 12, fontFamily: "IBM Plex Mono" }}
        />
        <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-border)" }} />
        <Area
          type="monotone"
          dataKey="equity"
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

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(true), []);

  if (points.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card px-6 text-center text-sm text-muted md:h-72">
        Two closed trades draw the equity curve.
      </div>
    );
  }

  return (
    <div className="flex h-64 flex-col rounded-xl border border-border bg-card p-4 md:h-72">
      <p className="text-sm text-muted">Equity</p>
      <div className="mt-3 min-h-0 flex-1">
        {show ? <ChartInner points={points} /> : null}
      </div>
    </div>
  );
}
