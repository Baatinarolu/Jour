import { format } from "date-fns";
import type { Grade, Market, Session, Side } from "./types";

export function moneyRound(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(n: number, withSign = true): string {
  const abs = Math.abs(moneyRound(n));
  const body = abs.toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (!withSign) return n < -0.004 ? `−${body}` : body;
  if (n > 0.004) return `+${body}`;
  if (n < -0.004) return `−${body}`;
  return body;
}

export function formatR(r: number | null): string {
  if (r == null || !Number.isFinite(r)) return "—";
  const v = Math.abs(r).toFixed(2);
  if (r > 0.0005) return `+${v}R`;
  if (r < -0.0005) return `−${v}R`;
  return "0.00R";
}

export function formatPct(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export function formatFactor(n: number | null): string {
  if (n == null) return "—";
  if (!Number.isFinite(n)) return "∞";
  return n.toFixed(2);
}

export function formatQty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function formatPrice(n: number): string {
  const abs = Math.abs(n);
  const max = abs >= 100 ? 2 : abs >= 1 ? 4 : 5;
  const rounded = Number(n.toFixed(max));
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: max,
  });
}

export function pnlClass(n: number): string {
  if (n > 0.004) return "text-up";
  if (n < -0.004) return "text-down";
  return "text-muted";
}

export function dayKey(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

export function formatDay(iso: string): string {
  return format(new Date(iso), "MMM d");
}

export function formatDayLong(iso: string): string {
  return format(new Date(iso), "EEE, MMM d");
}

export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function nowLocalInput(): string {
  return toDatetimeLocal(new Date().toISOString());
}

export function todayKey(now = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

const MARKET_LABEL: Record<Market, string> = {
  stocks: "Stocks",
  options: "Options",
  futures: "Futures",
  forex: "Forex",
  crypto: "Crypto",
};

const SESSION_LABEL: Record<Session, string> = {
  asia: "Asia",
  london: "London",
  newyork: "New York",
  other: "Other",
};

const SIDE_LABEL: Record<Side, string> = {
  long: "Long",
  short: "Short",
};

export function marketLabel(m: Market): string {
  return MARKET_LABEL[m];
}

export function sessionLabel(s: Session): string {
  return SESSION_LABEL[s];
}

export function sideLabel(s: Side): string {
  return SIDE_LABEL[s];
}

export function gradeLabel(g: Grade): string {
  return g;
}
