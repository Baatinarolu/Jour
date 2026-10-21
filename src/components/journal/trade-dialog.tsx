import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { AreaField, FieldLabel, SelectField, TextField } from "@/components/ui/field";
import { tradePnl, tradeR, tradeRisk, type TradeCore } from "@/lib/journal/calc";
import {
  emotionLabel,
  formatMoney,
  formatR,
  fromDatetimeLocal,
  marketLabel,
  nowLocalInput,
  pnlClass,
  sessionLabel,
  sideLabel,
  toDatetimeLocal,
} from "@/lib/journal/format";
import { calculateQuantity, reflectionPrompts } from "@/lib/journal/insights";
import { inferTradingViewSymbol, tradingViewChartUrl } from "@/lib/journal/tradingview";
import {
  defaultMultiplier,
  EMOTIONS,
  GRADES,
  MARKETS,
  SESSIONS,
  TIMEFRAMES,
  type Emotion,
  type Grade,
  type Market,
  type Playbook,
  type Session,
  type Side,
  type Trade,
} from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { ExternalLink, ImagePlus, Mic, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";

type Draft = {
  account: string;
  playbookId: string;
  symbol: string;
  tvSymbol: string;
  market: Market;
  side: Side;
  openedAt: string;
  closedAt: string;
  entry: string;
  exit: string;
  quantity: string;
  multiplier: string;
  stop: string;
  target: string;
  fees: string;
  setup: string;
  timeframe: string;
  session: Session;
  grade: Grade;
  followedPlan: boolean;
  criteriaChecked: string[];
  entryEmotion: string;
  exitEmotion: string;
  confidence: string;
  mistake: string;
  entryReason: string;
  exitReason: string;
  lesson: string;
  notes: string;
  voiceNote: string;
  screenshots: string[];
  mae: string;
  mfe: string;
  externalId: string;
  tags: string;
};

function blankDraft(playbooks: Playbook[], activePlaybookId: string | null): Draft {
  const now = nowLocalInput();
  const active = playbooks.find((item) => item.id === activePlaybookId) ?? playbooks[0];
  return {
    account: "Main",
    playbookId: active?.id ?? "",
    symbol: "",
    tvSymbol: "",
    market: "stocks",
    side: "long",
    openedAt: now,
    closedAt: now,
    entry: "",
    exit: "",
    quantity: "",
    multiplier: "1",
    stop: "",
    target: "",
    fees: "0",
    setup: active?.name ?? "",
    timeframe: active?.timeframes[0] ?? "15m",
    session: "newyork",
    grade: "B",
    followedPlan: true,
    criteriaChecked: [],
    entryEmotion: "",
    exitEmotion: "",
    confidence: "",
    mistake: "",
    entryReason: "",
    exitReason: "",
    lesson: "",
    notes: "",
    voiceNote: "",
    screenshots: [],
    mae: "",
    mfe: "",
    externalId: "",
    tags: "",
  };
}

function fromTrade(trade: Trade): Draft {
  return {
    account: trade.account ?? "Main",
    playbookId: trade.playbookId ?? "",
    symbol: trade.symbol,
    tvSymbol: trade.tvSymbol ?? "",
    market: trade.market,
    side: trade.side,
    openedAt: toDatetimeLocal(trade.openedAt),
    closedAt: toDatetimeLocal(trade.closedAt),
    entry: String(trade.entry),
    exit: String(trade.exit),
    quantity: String(trade.quantity),
    multiplier: String(trade.multiplier),
    stop: trade.stop == null ? "" : String(trade.stop),
    target: trade.target == null ? "" : String(trade.target),
    fees: String(trade.fees),
    setup: trade.setup,
    timeframe: trade.timeframe ?? "",
    session: trade.session,
    grade: trade.grade,
    followedPlan: trade.followedPlan,
    criteriaChecked: trade.criteriaChecked ?? [],
    entryEmotion: trade.entryEmotion ?? "",
    exitEmotion: trade.exitEmotion ?? "",
    confidence: trade.confidence == null ? "" : String(trade.confidence),
    mistake: trade.mistake ?? "",
    entryReason: trade.entryReason ?? "",
    exitReason: trade.exitReason ?? "",
    lesson: trade.lesson ?? "",
    notes: trade.notes,
    voiceNote: trade.voiceNote ?? "",
    screenshots: trade.screenshots ?? [],
    mae: trade.mae == null ? "" : String(trade.mae),
    mfe: trade.mfe == null ? "" : String(trade.mfe),
    externalId: trade.externalId ?? "",
    tags: trade.tags.join(", "),
  };
}

function num(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => {
                let nextIndex: number | null = null;
                if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (index + 1) % options.length;
                else if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (index - 1 + options.length) % options.length;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = options.length - 1;
                if (nextIndex == null) return;
                event.preventDefault();
                onChange(options[nextIndex].value);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')?.[nextIndex]
                  ?.focus();
              }}
              className={cn(
                "press h-11 rounded-sm px-3 text-sm",
                active ? "bg-accent text-accent-foreground" : "border border-border bg-background text-muted",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

async function compressImage(file: File): Promise<string> {
  const fallback = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });

  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return fallback();
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return fallback();
  }
}

type SpeechRecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function TradeDialog({
  open,
  trade,
  setups,
  playbooks = [],
  activePlaybookId = null,
  accounts = [],
  accountBalance = 0,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  trade: Trade | null;
  setups: string[];
  playbooks?: Playbook[];
  activePlaybookId?: string | null;
  accounts?: string[];
  accountBalance?: number;
  onOpenChange: (open: boolean) => void;
  onSave: (trade: Trade) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => blankDraft(playbooks, activePlaybookId));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [riskPct, setRiskPct] = useState("1");
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(trade ? fromTrade(trade) : blankDraft(playbooks, activePlaybookId));
    setError(null);
    setConfirmDelete(false);
    setListening(false);
  }, [open, trade, playbooks, activePlaybookId]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    },
    [],
  );

  const selectedPlaybook = playbooks.find((item) => item.id === draft.playbookId) ?? null;

  const preview = useMemo(() => {
    const entry = num(draft.entry);
    const exit = num(draft.exit);
    const quantity = num(draft.quantity);
    const multiplier = num(draft.multiplier);
    const fees = num(draft.fees) ?? 0;
    const stop = draft.stop.trim() ? num(draft.stop) : null;
    const target = draft.target.trim() ? num(draft.target) : null;
    if (
      entry == null || exit == null || quantity == null || quantity <= 0 ||
      multiplier == null || multiplier <= 0 ||
      (draft.stop.trim() !== "" && stop == null) ||
      (draft.target.trim() !== "" && target == null)
    ) return null;
    const core: TradeCore = { side: draft.side, entry, exit, quantity, multiplier, fees, stop };
    const risk = tradeRisk(core);
    const plannedRR = stop != null && target != null && Math.abs(entry - stop) > 0
      ? Math.abs(target - entry) / Math.abs(entry - stop)
      : null;
    return { pnl: tradePnl(core), r: tradeR(core), risk, plannedRR, entry, stop, multiplier };
  }, [draft]);

  const sizing = useMemo(() => {
    const entry = num(draft.entry);
    const stop = num(draft.stop);
    const multiplier = num(draft.multiplier);
    const pct = num(riskPct);
    if (entry == null || stop == null || multiplier == null || pct == null) return null;
    return calculateQuantity({ balance: accountBalance, riskPct: pct, entry, stop, multiplier });
  }, [accountBalance, draft.entry, draft.multiplier, draft.stop, riskPct]);

  const prompts = useMemo(() => {
    if (!preview) {
      return [
        "What exact evidence made this a valid entry?",
        "Was the result skill, process, or variance?",
        "What would make you refuse the identical setup tomorrow?",
      ];
    }
    const openedAt = fromDatetimeLocal(draft.openedAt) ?? new Date().toISOString();
    const closedAt = fromDatetimeLocal(draft.closedAt) ?? openedAt;
    return reflectionPrompts({
      id: trade?.id ?? "draft",
      symbol: draft.symbol || "DRAFT",
      market: draft.market,
      side: draft.side,
      openedAt,
      closedAt,
      entry: preview.entry,
      exit: num(draft.exit) ?? preview.entry,
      quantity: num(draft.quantity) ?? 1,
      multiplier: preview.multiplier,
      stop: preview.stop,
      fees: num(draft.fees) ?? 0,
      setup: draft.setup,
      session: draft.session,
      grade: draft.grade,
      followedPlan: draft.followedPlan,
      notes: draft.notes,
      tags: [],
      entryEmotion: (draft.entryEmotion || undefined) as Emotion | undefined,
      mistake: draft.mistake,
    });
  }, [draft, preview, trade?.id]);

  const inferredTvSymbol = inferTradingViewSymbol(draft.symbol, draft.market, draft.tvSymbol);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeMarket(market: Market) {
    setDraft((current) => ({
      ...current,
      market,
      multiplier: String(defaultMultiplier(market, current.symbol)),
    }));
  }

  function changePlaybook(id: string) {
    const playbook = playbooks.find((item) => item.id === id);
    setDraft((current) => {
      const setupWasPlaybook = playbooks.some((item) => item.name === current.setup);
      return {
        ...current,
        playbookId: id,
        setup: playbook && (!current.setup.trim() || setupWasPlaybook) ? playbook.name : current.setup,
        timeframe: playbook?.timeframes[0] ?? current.timeframe,
        criteriaChecked: [],
      };
    });
  }

  async function addImages(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    if (draft.screenshots.length >= 3) {
      setError("A journal entry can keep up to three chart screenshots. Remove one first.");
      return;
    }
    try {
      const compressed = await Promise.all(images.slice(0, 3 - draft.screenshots.length).map(compressImage));
      setDraft((current) => ({ ...current, screenshots: [...current.screenshots, ...compressed].slice(0, 3) }));
      setError(null);
    } catch {
      setError("That image could not be added. Try a PNG or JPG screenshot.");
    }
  }

  function onPaste(event: ClipboardEvent<HTMLFormElement>) {
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    void addImages(files);
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      setError("Voice dictation is not available in this browser. Typing still works everywhere.");
      return;
    }
    const recognition = new Constructor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) {
        setDraft((current) => ({
          ...current,
          voiceNote: current.voiceNote.trim() ? `${current.voiceNote.trim()} ${transcript}` : transcript,
        }));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }

  function save(asCopy = false) {
    const symbol = draft.symbol.trim().toUpperCase();
    const entry = num(draft.entry);
    const exit = num(draft.exit);
    const quantity = num(draft.quantity);
    const multiplier = num(draft.multiplier);
    const fees = num(draft.fees) ?? 0;
    const stop = draft.stop.trim() ? num(draft.stop) : null;
    const target = draft.target.trim() ? num(draft.target) : null;
    const mae = draft.mae.trim() ? num(draft.mae) : null;
    const mfe = draft.mfe.trim() ? num(draft.mfe) : null;
    const confidenceRaw = draft.confidence.trim() ? num(draft.confidence) : null;
    const openedAt = fromDatetimeLocal(draft.openedAt);
    const closedAt = fromDatetimeLocal(draft.closedAt);

    if (!symbol || entry == null || exit == null || quantity == null || quantity <= 0) {
      setError("Symbol, entry, exit, and size are required.");
      return;
    }
    if (multiplier == null || multiplier <= 0) return setError("Multiplier has to be above zero.");
    if (draft.stop.trim() && stop == null) return setError("Stop has to be a number, or left blank.");
    if (draft.target.trim() && target == null) return setError("Target has to be a number, or left blank.");
    if (stop != null && draft.side === "long" && stop >= entry) return setError("A long stop has to sit below entry.");
    if (stop != null && draft.side === "short" && stop <= entry) return setError("A short stop has to sit above entry.");
    if (target != null && draft.side === "long" && target <= entry) return setError("A long target has to sit above entry.");
    if (target != null && draft.side === "short" && target >= entry) return setError("A short target has to sit below entry.");
    if (draft.mae.trim() && mae == null) return setError("MAE has to be a price, or left blank.");
    if (draft.mfe.trim() && mfe == null) return setError("MFE has to be a price, or left blank.");
    if (mae != null && draft.side === "long" && mae > entry) return setError("For a long, MAE is the lowest price reached, so it cannot sit above entry.");
    if (mae != null && draft.side === "short" && mae < entry) return setError("For a short, MAE is the highest price reached, so it cannot sit below entry.");
    if (mfe != null && draft.side === "long" && mfe < entry) return setError("For a long, MFE is the highest price reached, so it cannot sit below entry.");
    if (mfe != null && draft.side === "short" && mfe > entry) return setError("For a short, MFE is the lowest price reached, so it cannot sit above entry.");
    if (confidenceRaw != null && (confidenceRaw < 1 || confidenceRaw > 5)) return setError("Confidence runs from 1 to 5.");
    if (fees < 0 || !Number.isFinite(fees)) return setError("Fees can’t be negative.");
    if (!openedAt || !closedAt) return setError("Open and close need a valid date.");
    if (Date.parse(closedAt) < Date.parse(openedAt)) return setError("Close is before the open.");

    const now = new Date().toISOString();
    const tags = [...new Set(draft.tags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    onSave({
      id: asCopy || !trade ? crypto.randomUUID() : trade.id,
      symbol,
      market: draft.market,
      side: draft.side,
      openedAt,
      closedAt,
      entry,
      exit,
      quantity,
      multiplier,
      stop,
      fees,
      setup: draft.setup.trim(),
      session: draft.session,
      grade: draft.grade,
      followedPlan: draft.followedPlan,
      notes: draft.notes.trim(),
      tags,
      account: draft.account.trim() || "Main",
      playbookId: draft.playbookId || null,
      target,
      timeframe: draft.timeframe.trim(),
      tvSymbol: draft.tvSymbol.trim().toUpperCase(),
      entryEmotion: (draft.entryEmotion || undefined) as Emotion | undefined,
      exitEmotion: (draft.exitEmotion || undefined) as Emotion | undefined,
      confidence: confidenceRaw == null ? undefined : Math.round(confidenceRaw),
      mistake: draft.mistake.trim(),
      lesson: draft.lesson.trim(),
      entryReason: draft.entryReason.trim(),
      exitReason: draft.exitReason.trim(),
      screenshots: draft.screenshots,
      voiceNote: draft.voiceNote.trim(),
      criteriaChecked: draft.criteriaChecked,
      mae,
      mfe,
      source: asCopy ? "manual" : (trade?.source ?? "manual"),
      externalId: draft.externalId.trim(),
      createdAt: asCopy ? now : (trade?.createdAt ?? now),
      updatedAt: now,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={trade ? trade.symbol : "Log a trade"}
      description="The numbers make it searchable. The context—playbook, emotions, chart and lesson—makes it useful."
    >
      <form
        className="grid gap-5"
        onPaste={onPaste}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {error ? <p role="alert" className="text-sm text-down">{error}</p> : null}

        <section className="grid gap-4">
          <h3 className="text-sm font-medium text-muted">Trade</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="account">Account</FieldLabel>
              <TextField id="account" value={draft.account} list="santandc-accounts" onChange={(event) => set("account", event.target.value)} placeholder="Main, Prop demo…" />
              <datalist id="santandc-accounts">
                {[...new Set(["Main", ...accounts])].map((account) => <option key={account} value={account} />)}
              </datalist>
            </div>
            <div>
              <FieldLabel htmlFor="playbook">Playbook</FieldLabel>
              <SelectField id="playbook" value={draft.playbookId} onChange={(event) => changePlaybook(event.target.value)}>
                <option value="">No playbook</option>
                {playbooks.map((playbook) => <option key={playbook.id} value={playbook.id}>{playbook.name}</option>)}
              </SelectField>
            </div>
            <div>
              <FieldLabel htmlFor="symbol">Symbol</FieldLabel>
              <TextField
                id="symbol"
                value={draft.symbol}
                onChange={(event) => set("symbol", event.target.value)}
                onBlur={() => {
                  if (draft.market === "futures" && draft.symbol.trim()) {
                    set("multiplier", String(defaultMultiplier("futures", draft.symbol)));
                  }
                }}
                autoComplete="off"
                placeholder="NVDA, ES, EURUSD…"
              />
            </div>
            <div>
              <FieldLabel htmlFor="market">Market</FieldLabel>
              <SelectField id="market" value={draft.market} onChange={(event) => changeMarket(event.target.value as Market)}>
                {MARKETS.map((market) => <option key={market} value={market}>{marketLabel(market)}</option>)}
              </SelectField>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="tv-symbol">TradingView symbol (optional)</FieldLabel>
              <div className="flex gap-2">
                <TextField id="tv-symbol" value={draft.tvSymbol} onChange={(event) => set("tvSymbol", event.target.value.toUpperCase())} placeholder={inferredTvSymbol || "NASDAQ:NVDA"} autoComplete="off" />
                {draft.symbol.trim() ? (
                  <a
                    href={tradingViewChartUrl({ symbol: draft.symbol, market: draft.market, tvSymbol: draft.tvSymbol, timeframe: draft.timeframe })}
                    target="_blank"
                    rel="noreferrer"
                    className="press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-sm border border-border bg-card-2 px-3 text-sm font-medium"
                  >
                    <ExternalLink className="size-4" /> TV
                  </a>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-subtle">Leave blank to infer common symbols. Exact form looks like NASDAQ:NVDA, FX:EURUSD or CME_MINI:ES1!.</p>
            </div>
          </div>

          <Choice label="Side" value={draft.side} onChange={(side) => set("side", side)} options={[{ value: "long", label: sideLabel("long") }, { value: "short", label: sideLabel("short") }]} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div><FieldLabel htmlFor="opened">Opened</FieldLabel><TextField id="opened" type="datetime-local" value={draft.openedAt} onChange={(event) => set("openedAt", event.target.value)} /></div>
            <div><FieldLabel htmlFor="closed">Closed</FieldLabel><TextField id="closed" type="datetime-local" value={draft.closedAt} onChange={(event) => set("closedAt", event.target.value)} /></div>
            <div><FieldLabel htmlFor="entry">Entry</FieldLabel><TextField id="entry" inputMode="decimal" value={draft.entry} onChange={(event) => set("entry", event.target.value)} /></div>
            <div><FieldLabel htmlFor="exit">Exit</FieldLabel><TextField id="exit" inputMode="decimal" value={draft.exit} onChange={(event) => set("exit", event.target.value)} /></div>
            <div><FieldLabel htmlFor="size">Size</FieldLabel><TextField id="size" inputMode="decimal" value={draft.quantity} onChange={(event) => set("quantity", event.target.value)} /></div>
            <div>
              <FieldLabel htmlFor="multiplier">Multiplier</FieldLabel>
              <TextField id="multiplier" inputMode="decimal" value={draft.multiplier} onChange={(event) => set("multiplier", event.target.value)} />
              <p className="mt-1 text-sm text-subtle">$ per point. Stocks/FX units 1 · Options 100 · ES 50.</p>
            </div>
            <div><FieldLabel htmlFor="stop">Stop</FieldLabel><TextField id="stop" inputMode="decimal" value={draft.stop} placeholder="For risk and R" onChange={(event) => set("stop", event.target.value)} /></div>
            <div><FieldLabel htmlFor="target">Target</FieldLabel><TextField id="target" inputMode="decimal" value={draft.target} placeholder="Planned exit" onChange={(event) => set("target", event.target.value)} /></div>
            <div><FieldLabel htmlFor="fees">Fees</FieldLabel><TextField id="fees" inputMode="decimal" value={draft.fees} onChange={(event) => set("fees", event.target.value)} /></div>
            <div>
              <FieldLabel htmlFor="setup">Setup</FieldLabel>
              <TextField id="setup" value={draft.setup} list="santandc-setups" onChange={(event) => set("setup", event.target.value)} placeholder="Pullback" />
              <datalist id="santandc-setups">
                {[...new Set([...playbooks.map((item) => item.name), ...setups])].map((setup) => <option key={setup} value={setup} />)}
              </datalist>
            </div>
            <div>
              <FieldLabel htmlFor="timeframe">Timeframe</FieldLabel>
              <SelectField id="timeframe" value={draft.timeframe} onChange={(event) => set("timeframe", event.target.value)}>
                <option value="">Not tagged</option>
                {TIMEFRAMES.map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
            </div>
            <div><FieldLabel htmlFor="external-id">Broker / external ID</FieldLabel><TextField id="external-id" value={draft.externalId} onChange={(event) => set("externalId", event.target.value)} placeholder="Optional, prevents duplicate imports" /></div>
            <div><FieldLabel htmlFor="mae">MAE price (optional)</FieldLabel><TextField id="mae" inputMode="decimal" value={draft.mae} onChange={(event) => set("mae", event.target.value)} placeholder={draft.side === "long" ? "Lowest reached" : "Highest reached"} /></div>
            <div><FieldLabel htmlFor="mfe">MFE price (optional)</FieldLabel><TextField id="mfe" inputMode="decimal" value={draft.mfe} onChange={(event) => set("mfe", event.target.value)} placeholder={draft.side === "long" ? "Highest reached" : "Lowest reached"} /></div>
          </div>

          <div className="rounded-sm border border-border bg-background p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full sm:max-w-36">
                <FieldLabel htmlFor="risk-pct">Risk %</FieldLabel>
                <TextField id="risk-pct" inputMode="decimal" value={riskPct} onChange={(event) => setRiskPct(event.target.value)} />
              </div>
              <Button type="button" variant="secondary" disabled={!sizing?.valid} onClick={() => sizing && set("quantity", String(sizing.quantity))}>
                Size from stop
              </Button>
              <p className="text-sm text-muted">
                {sizing?.valid
                  ? `${sizing.quantity.toLocaleString()} units risks ${formatMoney(sizing.risk, false)} of a ${formatMoney(sizing.riskBudget, false)} budget.`
                  : sizing?.message ?? "Add entry and stop to calculate size from the journal balance."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-border pt-5">
          <h3 className="text-sm font-medium text-muted">Process & psychology</h3>
          <Choice label="Session" value={draft.session} onChange={(session) => set("session", session)} options={SESSIONS.map((session) => ({ value: session, label: sessionLabel(session) }))} />
          <Choice label="Setup grade" value={draft.grade} onChange={(grade) => set("grade", grade)} options={GRADES.map((grade) => ({ value: grade, label: grade }))} />
          <Choice label="Followed the plan" value={draft.followedPlan ? "yes" : "no"} onChange={(value) => set("followedPlan", value === "yes")} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />

          {selectedPlaybook ? (
            <fieldset className="rounded-sm border border-border bg-background p-4">
              <legend className="px-1 text-sm font-medium text-muted">{selectedPlaybook.name} entry criteria</legend>
              <div className="grid gap-2">
                {selectedPlaybook.entryCriteria.map((criterion) => {
                  const checked = draft.criteriaChecked.includes(criterion);
                  return (
                    <label key={criterion} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border bg-card px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? draft.criteriaChecked.filter((item) => item !== criterion)
                            : [...draft.criteriaChecked, criterion];
                          setDraft((current) => ({
                            ...current,
                            criteriaChecked: next,
                            followedPlan: selectedPlaybook.entryCriteria.length > 0 && next.length === selectedPlaybook.entryCriteria.length,
                          }));
                        }}
                        className="size-4 shrink-0 accent-accent"
                      />
                      <span>{criterion}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-subtle">
                {draft.criteriaChecked.length} of {selectedPlaybook.entryCriteria.length} confirmed. Invalidation: {selectedPlaybook.invalidation || "Not written yet."}
              </p>
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="entry-emotion">Emotion at entry</FieldLabel>
              <SelectField id="entry-emotion" value={draft.entryEmotion} onChange={(event) => set("entryEmotion", event.target.value)}>
                <option value="">Not tagged</option>
                {EMOTIONS.map((emotion) => <option key={emotion} value={emotion}>{emotionLabel(emotion)}</option>)}
              </SelectField>
            </div>
            <div>
              <FieldLabel htmlFor="exit-emotion">Emotion at exit</FieldLabel>
              <SelectField id="exit-emotion" value={draft.exitEmotion} onChange={(event) => set("exitEmotion", event.target.value)}>
                <option value="">Not tagged</option>
                {EMOTIONS.map((emotion) => <option key={emotion} value={emotion}>{emotionLabel(emotion)}</option>)}
              </SelectField>
            </div>
            <div>
              <FieldLabel htmlFor="confidence">Confidence</FieldLabel>
              <SelectField id="confidence" value={draft.confidence} onChange={(event) => set("confidence", event.target.value)}>
                <option value="">Not tagged</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
              </SelectField>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="mistake">Main mistake (if any)</FieldLabel>
            <TextField id="mistake" value={draft.mistake} list="santandc-mistakes" onChange={(event) => set("mistake", event.target.value)} placeholder="Late entry, oversized, moved stop…" />
            <datalist id="santandc-mistakes">
              {["Late entry", "Oversized", "Moved stop", "Closed early", "Held loser", "Revenge trade", "No stop", "Ignored news", "Traded outside session"].map((item) => <option key={item} value={item} />)}
            </datalist>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><FieldLabel htmlFor="entry-reason">Why did you enter?</FieldLabel><AreaField id="entry-reason" className="min-h-20" value={draft.entryReason} maxLength={2000} onChange={(event) => set("entryReason", event.target.value)} placeholder="The evidence, in one or two sentences." /></div>
            <div><FieldLabel htmlFor="exit-reason">Why did you exit there?</FieldLabel><AreaField id="exit-reason" className="min-h-20" value={draft.exitReason} maxLength={2000} onChange={(event) => set("exitReason", event.target.value)} placeholder="Target, stop, structure, time, emotion…" /></div>
          </div>
          <div><FieldLabel htmlFor="tags">Tags</FieldLabel><TextField id="tags" value={draft.tags} onChange={(event) => set("tags", event.target.value)} placeholder="a+ setup, news day, scaled out" /></div>
        </section>

        <section className="grid gap-4 border-t border-border pt-5">
          <h3 className="text-sm font-medium text-muted">Review</h3>
          <div><FieldLabel htmlFor="notes">What happened?</FieldLabel><AreaField id="notes" value={draft.notes} maxLength={4000} onChange={(event) => set("notes", event.target.value)} placeholder="A factual replay, before judging it." /></div>
          <div><FieldLabel htmlFor="lesson">One lesson</FieldLabel><AreaField id="lesson" value={draft.lesson} maxLength={4000} onChange={(event) => set("lesson", event.target.value)} placeholder="One specific thing to repeat or stop." /></div>

          <div className="rounded-sm border border-border bg-background p-4">
            <p className="text-sm font-medium text-muted">Reflection prompts</p>
            <div className="mt-3 grid gap-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => set("lesson", draft.lesson.trim() ? `${draft.lesson.trim()}\n\n${prompt} ` : `${prompt} `)}
                  className="rounded-sm border border-border bg-card px-3 py-2 text-left text-sm text-muted hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <FieldLabel htmlFor="voice-note">Voice reflection</FieldLabel>
              <Button type="button" variant="secondary" size="sm" onClick={toggleVoice} aria-pressed={listening}>
                {listening ? <Square className="size-4" /> : <Mic className="size-4" />}
                {listening ? "Stop dictation" : "Dictate"}
              </Button>
            </div>
            <AreaField id="voice-note" value={draft.voiceNote} maxLength={10000} onChange={(event) => set("voiceNote", event.target.value)} placeholder="Dictate while the trade is fresh, or type a transcript here." />
            <p className="mt-1 text-sm text-subtle">Dictation is provided by your browser and may use its speech service. The saved transcript stays in this journal.</p>
          </div>

          <div>
            <FieldLabel>Chart screenshots</FieldLabel>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-4" /> Add chart image
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = "";
                  void addImages(files);
                }}
              />
              <p className="self-center text-sm text-subtle">Or paste a TradingView snapshot anywhere in this form. Up to 3, compressed locally.</p>
            </div>
            {draft.screenshots.length ? (
              <ul className="mt-3 grid gap-3">
                {draft.screenshots.map((src, index) => (
                  <li key={`${src.slice(0, 32)}-${index}`} className="overflow-hidden rounded-sm border border-border bg-background">
                    <img src={src} alt={`Chart screenshot ${index + 1}`} className="max-h-80 w-full object-contain" />
                    <div className="flex justify-end border-t border-border p-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => set("screenshots", draft.screenshots.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <div className="rounded-sm border border-border bg-background px-4 py-3">
          <p className="text-sm text-muted">Result</p>
          {preview ? (
            <>
              <p className={cn("mt-1 font-mono text-xl font-medium tabular-nums", pnlClass(preview.pnl))}>
                {formatMoney(preview.pnl)}<span className="ml-3 text-base text-muted">{formatR(preview.r)}</span>
              </p>
              <p className="mt-1 text-sm text-subtle">
                {preview.risk == null ? "Add a valid stop for planned risk." : `Planned risk ${formatMoney(preview.risk, false)}.`}
                {preview.plannedRR == null ? "" : ` Planned reward/risk ${preview.plannedRR.toFixed(2)}.`}
              </p>
            </>
          ) : <p className="mt-1 text-sm text-subtle">Enter prices, size, and multiplier to preview P&L.</p>}
        </div>

        {confirmDelete ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <p className="text-sm text-muted sm:mr-auto sm:self-center">Erase this trade? It cannot be undone.</p>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button variant="danger" onClick={() => { if (trade) onDelete(trade.id); onOpenChange(false); }}>Erase</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {trade ? (
              <>
                <Button variant="danger" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>Delete</Button>
                <Button variant="secondary" onClick={() => save(true)}>Duplicate</Button>
              </>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save trade</Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
