import type { Market, Trade } from "./types.ts";

const FUTURES_TV: Record<string, string> = {
  MES: "CME_MINI:MES1!",
  ES: "CME_MINI:ES1!",
  MNQ: "CME_MINI:MNQ1!",
  NQ: "CME_MINI:NQ1!",
  MYM: "CBOT_MINI:MYM1!",
  YM: "CBOT_MINI:YM1!",
  M2K: "CME_MINI:M2K1!",
  RTY: "CME_MINI:RTY1!",
  MCL: "NYMEX:MCL1!",
  CL: "NYMEX:CL1!",
  MGC: "COMEX:MGC1!",
  GC: "COMEX:GC1!",
  SI: "COMEX:SI1!",
  HG: "COMEX:HG1!",
  NG: "NYMEX:NG1!",
  ZB: "CBOT:ZB1!",
  ZN: "CBOT:ZN1!",
  ZF: "CBOT:ZF1!",
  "6E": "CME:6E1!",
  "6B": "CME:6B1!",
  "6J": "CME:6J1!",
};

const INDEX_TV: Record<string, string> = {
  SPX: "SP:SPX",
  SPX500: "SP:SPX",
  US500: "SP:SPX",
  NDX: "NASDAQ:NDX",
  NAS100: "NASDAQ:NDX",
  US100: "NASDAQ:NDX",
  DJI: "DJ:DJI",
  US30: "DJ:DJI",
  VIX: "TVC:VIX",
};

function cleanSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, "");
}

function futuresRoot(symbol: string): string {
  const normalized = cleanSymbol(symbol).replace(/[^A-Z0-9]/g, "");
  const roots = Object.keys(FUTURES_TV).sort((a, b) => b.length - a.length);
  for (const root of roots) {
    if (normalized === root || normalized.startsWith(`${root}1`) || normalized.startsWith(`${root}Z`)) return root;
    if (normalized.startsWith(root) && /[FGHJKMNQUVXZ]\d/.test(normalized.slice(root.length))) return root;
  }
  return normalized;
}

/**
 * Best-effort exchange mapping for common journal shorthand. A trader can
 * always save an exact TradingView symbol on the trade (e.g. NASDAQ:NVDA),
 * which takes precedence over this inference.
 */
export function inferTradingViewSymbol(symbol: string, market: Market, override?: string): string {
  const explicit = override?.trim().toUpperCase();
  if (explicit) return explicit;

  const raw = cleanSymbol(symbol);
  if (!raw) return "";
  if (raw.includes(":")) return raw;

  const compact = raw.replace(/[^A-Z0-9]/g, "");

  if (market === "futures") {
    const root = futuresRoot(raw);
    return FUTURES_TV[root] ?? raw;
  }
  if (market === "indices") return INDEX_TV[compact] ?? raw;
  if (market === "forex") {
    if (/^[A-Z]{6}$/.test(compact)) return `FX:${compact}`;
    if (/^[A-Z]{3}\/[A-Z]{3}$/.test(raw)) return `FX:${raw.replace("/", "")}`;
    return raw;
  }
  if (market === "metals") {
    if (compact === "XAUUSD" || compact === "GOLD") return "OANDA:XAUUSD";
    if (compact === "XAGUSD" || compact === "SILVER") return "OANDA:XAGUSD";
    return raw;
  }
  if (market === "commodities") {
    if (compact === "WTI" || compact === "USOIL" || compact === "CL") return "NYMEX:CL1!";
    if (compact === "BRENT" || compact === "UKOIL") return "ICEEUR:BRN1!";
    if (compact === "NATGAS" || compact === "NG") return "NYMEX:NG1!";
    return raw;
  }
  if (market === "crypto") {
    if (/^(BTC|ETH|SOL|XRP|DOGE|ADA|LTC|LINK|AVAX)$/.test(compact)) return `BINANCE:${compact}USDT`;
    if (/^[A-Z]+USD$/.test(compact)) return `BINANCE:${compact}T`;
    return raw;
  }
  return raw;
}

/** Convert journal timeframe shorthand to TradingView widget intervals. */
export function tradingViewInterval(timeframe?: string): string {
  const value = (timeframe ?? "").trim();
  switch (value) {
    case "1m": return "1";
    case "5m": return "5";
    case "15m": return "15";
    case "30m": return "30";
    case "1H": return "60";
    case "4H": return "240";
    case "1D": return "D";
    case "1W": return "W";
    default: return value || "5";
  }
}

export function tradingViewChartUrl(trade: Pick<Trade, "symbol" | "market" | "timeframe" | "tvSymbol">): string {
  const symbol = inferTradingViewSymbol(trade.symbol, trade.market, trade.tvSymbol);
  const params = new URLSearchParams({
    symbol,
    interval: tradingViewInterval(trade.timeframe),
  });
  return `https://www.tradingview.com/chart/?${params.toString()}`;
}

export function tradingViewWatchlist(trades: readonly Trade[], limit = 20): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();
  for (const trade of trades) {
    const symbol = inferTradingViewSymbol(trade.symbol, trade.market, trade.tvSymbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
    if (symbols.length >= limit) break;
  }
  return symbols;
}
