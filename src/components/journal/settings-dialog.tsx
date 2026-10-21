import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { FieldLabel, TextField } from "@/components/ui/field";
import { parseBackup, serializeBackup } from "@/lib/journal/backup";
import { parseCsvTrades, tradesToCsv, type CsvImportResult } from "@/lib/journal/csv";
import type { JournalBackup, Trade } from "@/lib/journal/types";
import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";

export function SettingsDialog({
  open,
  onOpenChange,
  startingBalance,
  backup,
  onBalance,
  onReplace,
  onImportCsv,
  onClear,
  onSample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startingBalance: number;
  backup: JournalBackup;
  onBalance: (value: number) => void;
  onReplace: (data: JournalBackup) => void;
  onImportCsv: (trades: Trade[]) => void;
  onClear: () => void;
  onSample: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [balance, setBalance] = useState(String(startingBalance));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<JournalBackup | null>(null);
  const [pendingCsv, setPendingCsv] = useState<CsvImportResult | null>(null);
  const [mode, setMode] = useState<"idle" | "clear" | "sample">("idle");

  useEffect(() => {
    if (!open) return;
    setBalance(String(startingBalance));
    setError(null);
    setPending(null);
    setPendingCsv(null);
    setMode("idle");
  }, [open, startingBalance]);

  function close(next: boolean) {
    if (!next) {
      setError(null);
      setPending(null);
      setPendingCsv(null);
      setMode("idle");
      setBalance(String(startingBalance));
    }
    onOpenChange(next);
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Settings"
      description="Stored in this browser only. Download a backup if you want a copy."
    >
      <div className="grid gap-5">
        {error ? (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        ) : null}

        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(balance);
            if (!Number.isFinite(value) || value < 0) {
              setError("Starting balance has to be zero or more.");
              return;
            }
            setError(null);
            onBalance(value);
          }}
        >
          <FieldLabel htmlFor="balance">Starting balance</FieldLabel>
          <div className="flex gap-2">
            <TextField
              id="balance"
              inputMode="decimal"
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
            />
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </div>
          <p className="text-sm text-subtle">Used for the equity curve and drawdown.</p>
        </form>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => {
              const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `santandc-${format(new Date(), "yyyy-MM-dd")}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download backup
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Restore backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const parsed = parseBackup(await file.text());
              if (!parsed.ok) {
                setError("That file isn’t a SANTANDC backup.");
                setPending(null);
                return;
              }
              setError(null);
              setPending(parsed.data);
              setPendingCsv(null);
              setMode("idle");
            }}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => {
              const blob = new Blob([tradesToCsv(backup.trades)], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `santandc-trades-${format(new Date(), "yyyy-MM-dd")}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </Button>
          <Button variant="secondary" onClick={() => csvRef.current?.click()}>
            Import CSV
          </Button>
          <input
            ref={csvRef}
            type="file"
            accept="text/csv,.csv"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const parsed = parseCsvTrades(await file.text());
              if (!parsed.trades.length) {
                setError(parsed.errors[0] ?? "No trades found in that CSV.");
                setPendingCsv(null);
                return;
              }
              setError(null);
              setPending(null);
              setPendingCsv(parsed);
              setMode("idle");
            }}
          />
        </div>
        <p className="-mt-3 text-sm text-subtle">
          CSV adds trades and automatically skips exact duplicates on re-import. Screenshots live in the JSON backup, not CSV. A backup replaces the journal including playbooks, daily entries, and weekly reviews.
        </p>

        {pending ? (
          <div className="rounded-sm border border-border bg-background p-4">
            <p className="text-sm">
              Replace this journal with {pending.trades.length} trades, {pending.playbooks.length} playbooks, {Object.keys(pending.dayEntries).length} daily entries, and {pending.weeklyReviews.length} weekly reviews from the file?
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => {
                  onReplace(pending);
                  setPending(null);
                  close(false);
                }}
              >
                Replace
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {pendingCsv ? (
          <div className="rounded-sm border border-border bg-background p-4">
            <p className="text-sm">
              Add up to {pendingCsv.trades.length} trades from the CSV? Exact duplicates already in the journal will be skipped.
            </p>
            {pendingCsv.errors.length ? (
              <p className="mt-2 text-sm text-muted">
                {pendingCsv.errors.length} rows will be skipped. First: {pendingCsv.errors[0]}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => {
                  onImportCsv(pendingCsv.trades);
                  setPendingCsv(null);
                  close(false);
                }}
              >
                Add trades
              </Button>
              <Button variant="ghost" onClick={() => setPendingCsv(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "clear" ? (
          <div className="rounded-sm border border-border bg-background p-4">
            <p className="text-sm">Erase every trade, daily entry, and weekly review? Rules, playbooks, and the starting balance stay.</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  onClear();
                  setMode("idle");
                  close(false);
                }}
              >
                Erase trades
              </Button>
              <Button variant="ghost" onClick={() => setMode("idle")}>
                Keep
              </Button>
            </div>
          </div>
        ) : mode === "sample" ? (
          <div className="rounded-sm border border-border bg-background p-4">
            <p className="text-sm">Replace trades, rules, playbooks, daily entries, weekly reviews, and balance with the sample book?</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  onSample();
                  setMode("idle");
                  close(false);
                }}
              >
                Load sample
              </Button>
              <Button variant="ghost" onClick={() => setMode("idle")}>
                Keep mine
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="ghost" onClick={() => setMode("sample")}>
              Load sample book
            </Button>
            <Button variant="danger" onClick={() => setMode("clear")}>
              Erase trades
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
