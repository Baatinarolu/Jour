import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { AreaField, FieldLabel, SelectField, TextField } from "@/components/ui/field";
import { tradePnl, tradeR, type TradeCore } from "@/lib/journal/calc";
import {
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
import { GRADES, MARKETS, SESSIONS, type Grade, type Market, type Session, type Side, type Trade } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type Draft = {
  symbol: string;
  market: Market;
  side: Side;
  openedAt: string;
  closedAt: string;
  entry: string;
  exit: string;
  quantity: string;
  stop: string;
  fees: string;
  setup: string;
  session: Session;
  grade: Grade;
  followedPlan: boolean;
  notes: string;
  tags: string;
};

function blankDraft(): Draft {
  const now = nowLocalInput();
  return {
    symbol: "",
    market: "stocks",
    side: "long",
    openedAt: now,
    closedAt: now,
    entry: "",
    exit: "",
    quantity: "",
    stop: "",
    fees: "0",
    setup: "",
    session: "newyork",
    grade: "B",
    followedPlan: true,
    notes: "",
    tags: "",
  };
}

function fromTrade(trade: Trade): Draft {
  return {
    symbol: trade.symbol,
    market: trade.market,
    side: trade.side,
    openedAt: toDatetimeLocal(trade.openedAt),
    closedAt: toDatetimeLocal(trade.closedAt),
    entry: String(trade.entry),
    exit: String(trade.exit),
    quantity: String(trade.quantity),
    stop: trade.stop == null ? "" : String(trade.stop),
    fees: String(trade.fees),
    setup: trade.setup,
    session: trade.session,
    grade: trade.grade,
    followedPlan: trade.followedPlan,
    notes: trade.notes,
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
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
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

export function TradeDialog({
  open,
  trade,
  setups,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  trade: Trade | null;
  setups: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (trade: Trade) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(trade ? fromTrade(trade) : blankDraft());
    setError(null);
    setConfirmDelete(false);
  }, [open, trade]);

  const preview = useMemo(() => {
    const entry = num(draft.entry);
    const exit = num(draft.exit);
    const quantity = num(draft.quantity);
    const fees = num(draft.fees) ?? 0;
    const stop = draft.stop.trim() ? num(draft.stop) : null;
    if (
      entry == null ||
      exit == null ||
      quantity == null ||
      quantity <= 0 ||
      (draft.stop.trim() !== "" && stop == null)
    ) {
      return null;
    }
    const core: TradeCore = {
      side: draft.side,
      entry,
      exit,
      quantity,
      fees,
      stop,
    };
    return { pnl: tradePnl(core), r: tradeR(core) };
  }, [draft]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save() {
    const symbol = draft.symbol.trim().toUpperCase();
    const entry = num(draft.entry);
    const exit = num(draft.exit);
    const quantity = num(draft.quantity);
    const fees = num(draft.fees) ?? 0;
    const stop = draft.stop.trim() ? num(draft.stop) : null;
    const openedAt = fromDatetimeLocal(draft.openedAt);
    const closedAt = fromDatetimeLocal(draft.closedAt);
    if (!symbol || entry == null || exit == null || quantity == null || quantity <= 0) {
      setError("Symbol, entry, exit, and size are required.");
      return;
    }
    if (draft.stop.trim() && stop == null) {
      setError("Stop has to be a number, or left blank.");
      return;
    }
    if (fees < 0 || !Number.isFinite(fees)) {
      setError("Fees can’t be negative.");
      return;
    }
    if (!openedAt || !closedAt) {
      setError("Open and close need a valid date.");
      return;
    }
    if (new Date(closedAt).getTime() < new Date(openedAt).getTime()) {
      setError("Close is before the open.");
      return;
    }
    const tags = [...new Set(draft.tags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 6);
    onSave({
      id: trade?.id ?? crypto.randomUUID(),
      symbol,
      market: draft.market,
      side: draft.side,
      openedAt,
      closedAt,
      entry,
      exit,
      quantity,
      stop,
      fees,
      setup: draft.setup.trim(),
      session: draft.session,
      grade: draft.grade,
      followedPlan: draft.followedPlan,
      notes: draft.notes.trim(),
      tags,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={trade ? trade.symbol : "Log a trade"}
      description="Closed trades only. Size is shares, units, or dollars per point — one ES contract is 50."
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {error ? (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="symbol">Symbol</FieldLabel>
            <TextField
              id="symbol"
              value={draft.symbol}
              onChange={(event) => set("symbol", event.target.value)}
              autoComplete="off"
              placeholder="NVDA"
            />
          </div>
          <div>
            <FieldLabel htmlFor="market">Market</FieldLabel>
            <SelectField
              id="market"
              value={draft.market}
              onChange={(event) => set("market", event.target.value as Market)}
            >
              {MARKETS.map((market) => (
                <option key={market} value={market}>
                  {marketLabel(market)}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        <Choice
          label="Side"
          value={draft.side}
          onChange={(side) => set("side", side)}
          options={[
            { value: "long", label: sideLabel("long") },
            { value: "short", label: sideLabel("short") },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="opened">Opened</FieldLabel>
            <TextField
              id="opened"
              type="datetime-local"
              value={draft.openedAt}
              onChange={(event) => set("openedAt", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="closed">Closed</FieldLabel>
            <TextField
              id="closed"
              type="datetime-local"
              value={draft.closedAt}
              onChange={(event) => set("closedAt", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="entry">Entry</FieldLabel>
            <TextField
              id="entry"
              inputMode="decimal"
              value={draft.entry}
              onChange={(event) => set("entry", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="exit">Exit</FieldLabel>
            <TextField
              id="exit"
              inputMode="decimal"
              value={draft.exit}
              onChange={(event) => set("exit", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="size">Size</FieldLabel>
            <TextField
              id="size"
              inputMode="decimal"
              value={draft.quantity}
              onChange={(event) => set("quantity", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="stop">Stop</FieldLabel>
            <TextField
              id="stop"
              inputMode="decimal"
              value={draft.stop}
              placeholder="Optional, for R"
              onChange={(event) => set("stop", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="fees">Fees</FieldLabel>
            <TextField
              id="fees"
              inputMode="decimal"
              value={draft.fees}
              onChange={(event) => set("fees", event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="setup">Setup</FieldLabel>
            <TextField
              id="setup"
              value={draft.setup}
              list="folio-setups"
              onChange={(event) => set("setup", event.target.value)}
              placeholder="Pullback"
            />
            <datalist id="folio-setups">
              {[...new Set(["Pullback", "Breakout", "Opening drive", "Mean revert", "Reversal", ...setups])].map(
                (setup) => (
                  <option key={setup} value={setup} />
                ),
              )}
            </datalist>
          </div>
        </div>

        <Choice
          label="Session"
          value={draft.session}
          onChange={(session) => set("session", session)}
          options={SESSIONS.map((session) => ({ value: session, label: sessionLabel(session) }))}
        />
        <Choice
          label="Grade"
          value={draft.grade}
          onChange={(grade) => set("grade", grade)}
          options={GRADES.map((grade) => ({ value: grade, label: grade }))}
        />
        <Choice
          label="Followed the plan"
          value={draft.followedPlan ? "yes" : "no"}
          onChange={(value) => set("followedPlan", value === "yes")}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />

        <div>
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <TextField
            id="tags"
            value={draft.tags}
            onChange={(event) => set("tags", event.target.value)}
            placeholder="oversize, late entry"
          />
        </div>
        <div>
          <FieldLabel htmlFor="notes">Lesson</FieldLabel>
          <AreaField
            id="notes"
            value={draft.notes}
            maxLength={2000}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="What you will do the same, or not."
          />
        </div>

        <div className="rounded-sm border border-border bg-background px-4 py-3">
          <p className="text-sm text-muted">Result</p>
          {preview ? (
            <p className={cn("mt-1 font-mono text-xl font-medium tabular-nums", pnlClass(preview.pnl))}>
              {formatMoney(preview.pnl)}
              <span className="ml-3 text-base text-muted">{formatR(preview.r)}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-subtle">Enter prices and size to preview P&L.</p>
          )}
        </div>

        {confirmDelete ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <p className="text-sm text-muted sm:mr-auto sm:self-center">Erase this trade? It cannot be undone.</p>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (trade) onDelete(trade.id);
                onOpenChange(false);
              }}
            >
              Erase
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {trade ? (
              <Button variant="danger" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save trade</Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
