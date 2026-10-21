import { tradePnl, tradeR } from "./calc.ts";
import { moneyRound } from "./format.ts";
import { defaultMultiplier, EMOTIONS, type Emotion, type Grade, type Market, type Session, type Side, type Trade, type TradeSource } from "./types.ts";

const HEADERS = [
  "id",
  "externalId",
  "account",
  "symbol",
  "tvSymbol",
  "market",
  "side",
  "openedAt",
  "closedAt",
  "entry",
  "exit",
  "quantity",
  "multiplier",
  "stop",
  "target",
  "fees",
  "setup",
  "playbookId",
  "timeframe",
  "session",
  "grade",
  "followedPlan",
  "criteriaChecked",
  "entryEmotion",
  "exitEmotion",
  "confidence",
  "mistake",
  "entryReason",
  "exitReason",
  "lesson",
  "notes",
  "voiceNote",
  "mae",
  "mfe",
  "tags",
  "source",
  "pnl",
  "r",
] as const;

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function tradesToCsv(trades: readonly Trade[]): string {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
  );
  const rows = sorted.map((trade) => {
    const r = tradeR(trade);
    return [
      trade.id,
      trade.externalId ?? "",
      trade.account ?? "Main",
      trade.symbol,
      trade.tvSymbol ?? "",
      trade.market,
      trade.side,
      trade.openedAt,
      trade.closedAt,
      trade.entry,
      trade.exit,
      trade.quantity,
      trade.multiplier,
      trade.stop,
      trade.target ?? null,
      trade.fees,
      trade.setup,
      trade.playbookId ?? "",
      trade.timeframe ?? "",
      trade.session,
      trade.grade,
      String(trade.followedPlan),
      (trade.criteriaChecked ?? []).join("; "),
      trade.entryEmotion ?? "",
      trade.exitEmotion ?? "",
      trade.confidence ?? "",
      trade.mistake ?? "",
      trade.entryReason ?? "",
      trade.exitReason ?? "",
      trade.lesson ?? "",
      trade.notes,
      trade.voiceNote ?? "",
      trade.mae ?? null,
      trade.mfe ?? null,
      trade.tags.join("; "),
      trade.source ?? "manual",
      moneyRound(tradePnl(trade)),
      r == null ? "" : r.toFixed(4),
    ]
      .map(csvCell)
      .join(",");
  });
  return [HEADERS.join(","), ...rows].join("\r\n") + "\r\n";
}

/** Minimal RFC-4180-style CSV parser: quoted cells, escaped quotes, CRLF. */
export function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quoted) {
      if (char === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

type Field =
  | "id"
  | "externalId"
  | "account"
  | "symbol"
  | "tvSymbol"
  | "market"
  | "side"
  | "openedAt"
  | "closedAt"
  | "entry"
  | "exit"
  | "quantity"
  | "multiplier"
  | "stop"
  | "target"
  | "fees"
  | "setup"
  | "playbookId"
  | "timeframe"
  | "session"
  | "grade"
  | "followedPlan"
  | "criteriaChecked"
  | "entryEmotion"
  | "exitEmotion"
  | "confidence"
  | "mistake"
  | "entryReason"
  | "exitReason"
  | "lesson"
  | "notes"
  | "voiceNote"
  | "mae"
  | "mfe"
  | "tags"
  | "source";

const HEADER_ALIASES: Record<string, Field> = {
  id: "id",
  tradeid: "id",
  externalid: "externalId",
  positionid: "externalId",
  dealid: "externalId",
  orderid: "externalId",
  ticket: "externalId",
  account: "account",
  accountname: "account",
  accountid: "account",
  symbol: "symbol",
  pair: "symbol",
  ticker: "symbol",
  instrument: "symbol",
  tvsymbol: "tvSymbol",
  tradingviewsymbol: "tvSymbol",
  market: "market",
  assetclass: "market",
  side: "side",
  type: "side",
  ordertype: "side",
  tradetype: "side",
  direction: "side",
  longshort: "side",
  openedat: "openedAt",
  opened: "openedAt",
  opentime: "openedAt",
  opendate: "openedAt",
  entrytime: "openedAt",
  entrydate: "openedAt",
  date: "openedAt",
  closedat: "closedAt",
  closed: "closedAt",
  closetime: "closedAt",
  closedate: "closedAt",
  exittime: "closedAt",
  exitdate: "closedAt",
  entry: "entry",
  entryprice: "entry",
  openprice: "entry",
  exit: "exit",
  exitprice: "exit",
  closeprice: "exit",
  quantity: "quantity",
  size: "quantity",
  qty: "quantity",
  shares: "quantity",
  contracts: "quantity",
  units: "quantity",
  volume: "quantity",
  lots: "quantity",
  lot: "quantity",
  lotsize: "quantity",
  multiplier: "multiplier",
  pointvalue: "multiplier",
  contractmultiplier: "multiplier",
  stop: "stop",
  stopprice: "stop",
  stoploss: "stop",
  sl: "stop",
  target: "target",
  targetprice: "target",
  takeprofit: "target",
  tp: "target",
  fees: "fees",
  fee: "fees",
  commission: "fees",
  commissions: "fees",
  setup: "setup",
  strategy: "setup",
  playbook: "setup",
  playbookid: "playbookId",
  timeframe: "timeframe",
  interval: "timeframe",
  tf: "timeframe",
  session: "session",
  grade: "grade",
  followedplan: "followedPlan",
  followedtheplan: "followedPlan",
  plan: "followedPlan",
  onplan: "followedPlan",
  criteriachecked: "criteriaChecked",
  criteria: "criteriaChecked",
  entrycriteria: "criteriaChecked",
  entryemotion: "entryEmotion",
  emotionatentry: "entryEmotion",
  emotion: "entryEmotion",
  exitemotion: "exitEmotion",
  emotionatexit: "exitEmotion",
  confidence: "confidence",
  conviction: "confidence",
  mistake: "mistake",
  error: "mistake",
  entryreason: "entryReason",
  reasonforentry: "entryReason",
  thesis: "entryReason",
  exitreason: "exitReason",
  reasonforexit: "exitReason",
  lesson: "lesson",
  takeaway: "lesson",
  notes: "notes",
  note: "notes",
  comment: "notes",
  voicenote: "voiceNote",
  voicetranscript: "voiceNote",
  mae: "mae",
  maxadverseexcursion: "mae",
  mfe: "mfe",
  maxfavorableexcursion: "mfe",
  source: "source",
  platform: "source",
  tags: "tags",
  tag: "tags",
  labels: "tags",
};

function normalizeHeader(value: string): string {
  return value.replace(/^\ufeff/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.trim().replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const text = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseMarket(value: string | undefined): Market {
  const key = (value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (["options", "option"].includes(key)) return "options";
  if (["futures", "future"].includes(key)) return "futures";
  if (["forex", "fx", "currency", "currencies"].includes(key)) return "forex";
  if (["crypto", "cryptocurrency", "cryptocurrencies"].includes(key)) return "crypto";
  if (["indices", "index", "indexes"].includes(key)) return "indices";
  if (["commodities", "commodity"].includes(key)) return "commodities";
  if (["metals", "metal", "gold", "silver"].includes(key)) return "metals";
  return "stocks";
}

function parseSide(value: string | undefined): Side {
  const key = (value ?? "").trim().toLowerCase();
  return ["short", "sell", "s", "sold"].includes(key) ? "short" : "long";
}

function parseSession(value: string | undefined): Session {
  const key = (value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (key === "asia" || key === "tokyo") return "asia";
  if (key === "london" || key === "europe") return "london";
  if (["overlap", "londonnewyork", "londonny", "newyorklondon"].includes(key)) return "overlap";
  if (["newyork", "ny", "us", "usa", "america"].includes(key)) return "newyork";
  return "other";
}

function parseGrade(value: string | undefined): Grade {
  const key = (value ?? "").trim().toUpperCase();
  if (key.startsWith("A+")) return "A+";
  const first = key.charAt(0);
  return first === "A" || first === "B" || first === "C" || first === "D" || first === "F" ? first : "B";
}

function parseEmotion(value: string | undefined): Emotion | undefined {
  const key = (value ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return (EMOTIONS as readonly string[]).includes(key) ? (key as Emotion) : undefined;
}

function parseSource(value: string | undefined): TradeSource {
  const key = (value ?? "").trim().toLowerCase();
  return key === "manual" || key === "sample" ? key : "csv";
}

function parseBoolean(value: string | undefined): boolean {
  const key = (value ?? "").trim().toLowerCase();
  if (["false", "no", "n", "0", "off", "broke", "offplan"].includes(key)) return false;
  return true;
}

function freshId(rowNumber: number): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `csv-${Date.now()}-${rowNumber}`;
}

export type CsvImportResult = { trades: Trade[]; errors: string[] };

export function parseCsvTrades(raw: string): CsvImportResult {
  const rows = parseCsvRows(raw);
  if (rows.length < 2) return { trades: [], errors: ["The CSV has no trade rows."] };

  const columns = new Map<Field, number>();
  rows[0].forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field && !columns.has(field)) columns.set(field, index);
  });

  const missing = (["symbol", "entry", "exit", "quantity"] as Field[]).filter((f) => !columns.has(f));
  if (missing.length) {
    return { trades: [], errors: [`Missing required columns: ${missing.join(", ")}.`] };
  }

  const trades: Trade[] = [];
  const errors: string[] = [];
  const usedIds = new Set<string>();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;
    const get = (field: Field) => {
      const column = columns.get(field);
      return column == null ? undefined : row[column];
    };

    const symbol = (get("symbol") ?? "").trim().toUpperCase();
    const market = parseMarket(get("market"));
    const side = parseSide(get("side"));
    const entry = parseNumber(get("entry"));
    const exit = parseNumber(get("exit"));
    const quantity = parseNumber(get("quantity"));
    const multiplierRaw = get("multiplier");
    const multiplier = multiplierRaw == null || multiplierRaw.trim() === ""
      ? defaultMultiplier(market, symbol)
      : parseNumber(multiplierRaw);
    const feesRaw = get("fees");
    const fees = feesRaw == null || feesRaw.trim() === "" ? 0 : parseNumber(feesRaw);
    const stopRaw = get("stop");
    const stop = stopRaw == null || stopRaw.trim() === "" ? null : parseNumber(stopRaw);
    const targetRaw = get("target");
    const target = targetRaw == null || targetRaw.trim() === "" ? null : parseNumber(targetRaw);
    const maeRaw = get("mae");
    const mae = maeRaw == null || maeRaw.trim() === "" ? null : parseNumber(maeRaw);
    const mfeRaw = get("mfe");
    const mfe = mfeRaw == null || mfeRaw.trim() === "" ? null : parseNumber(mfeRaw);
    const confidenceRaw = parseNumber(get("confidence"));
    const confidence = confidenceRaw == null ? undefined : Math.min(5, Math.max(1, Math.round(confidenceRaw)));
    const openedAt = parseDate(get("openedAt")) ?? parseDate(get("closedAt"));
    const closedAt = parseDate(get("closedAt")) ?? openedAt;

    if (!symbol) errors.push(`Row ${rowNumber}: symbol is blank.`);
    else if (entry == null) errors.push(`Row ${rowNumber}: entry is not a number.`);
    else if (exit == null) errors.push(`Row ${rowNumber}: exit is not a number.`);
    else if (quantity == null || quantity <= 0) errors.push(`Row ${rowNumber}: quantity must be above zero.`);
    else if (multiplier == null || multiplier <= 0) errors.push(`Row ${rowNumber}: multiplier must be above zero.`);
    else if (fees == null) errors.push(`Row ${rowNumber}: fees are not a number.`);
    else if (stopRaw != null && stopRaw.trim() !== "" && stop == null) {
      errors.push(`Row ${rowNumber}: stop is not a number.`);
    } else if (stop != null && side === "long" && stop >= entry) {
      errors.push(`Row ${rowNumber}: a long stop must sit below entry.`);
    } else if (stop != null && side === "short" && stop <= entry) {
      errors.push(`Row ${rowNumber}: a short stop must sit above entry.`);
    } else if (!openedAt || !closedAt) errors.push(`Row ${rowNumber}: missing or invalid date.`);
    else if (Date.parse(closedAt) < Date.parse(openedAt)) {
      errors.push(`Row ${rowNumber}: close is before the open.`);
    } else {
      let id = (get("id") ?? "").trim() || freshId(rowNumber);
      if (usedIds.has(id)) id = freshId(rowNumber);
      usedIds.add(id);
      trades.push({
        id,
        symbol,
        market,
        side,
        openedAt,
        closedAt,
        entry,
        exit,
        quantity,
        multiplier,
        stop,
        fees: Math.abs(fees),
        setup: (get("setup") ?? "").trim(),
        session: parseSession(get("session")),
        grade: parseGrade(get("grade")),
        followedPlan: parseBoolean(get("followedPlan")),
        notes: (get("notes") ?? "").trim(),
        tags: [...new Set((get("tags") ?? "").split(/[;|,]/).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
        account: (get("account") ?? "Main").trim() || "Main",
        playbookId: (get("playbookId") ?? "").trim() || null,
        target,
        timeframe: (get("timeframe") ?? "").trim(),
        tvSymbol: (get("tvSymbol") ?? "").trim().toUpperCase(),
        entryEmotion: parseEmotion(get("entryEmotion")),
        exitEmotion: parseEmotion(get("exitEmotion")),
        confidence,
        mistake: (get("mistake") ?? "").trim(),
        lesson: (get("lesson") ?? "").trim(),
        entryReason: (get("entryReason") ?? "").trim(),
        exitReason: (get("exitReason") ?? "").trim(),
        screenshots: [],
        voiceNote: (get("voiceNote") ?? "").trim(),
        criteriaChecked: [...new Set((get("criteriaChecked") ?? "").split(/[;|]/).map((item) => item.trim()).filter(Boolean))],
        mae,
        mfe,
        source: parseSource(get("source")),
        externalId: (get("externalId") ?? "").trim(),
      });
    }
  }

  return { trades, errors };
}
