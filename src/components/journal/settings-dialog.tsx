import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { FieldLabel, TextField } from "@/components/ui/field";
import { parseBackup, serializeBackup } from "@/lib/journal/backup";
import type { JournalBackup } from "@/lib/journal/types";
import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";

export function SettingsDialog({
  open,
  onOpenChange,
  startingBalance,
  backup,
  onBalance,
  onReplace,
  onClear,
  onSample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startingBalance: number;
  backup: JournalBackup;
  onBalance: (value: number) => void;
  onReplace: (data: JournalBackup) => void;
  onClear: () => void;
  onSample: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [balance, setBalance] = useState(String(startingBalance));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<JournalBackup | null>(null);
  const [mode, setMode] = useState<"idle" | "clear" | "sample">("idle");

  useEffect(() => {
    if (!open) return;
    setBalance(String(startingBalance));
    setError(null);
    setPending(null);
    setMode("idle");
  }, [open, startingBalance]);

  function close(next: boolean) {
    if (!next) {
      setError(null);
      setPending(null);
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
              link.download = `folio-${format(new Date(), "yyyy-MM-dd")}.json`;
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
                setError("That file isn’t a Folio backup.");
                setPending(null);
                return;
              }
              setError(null);
              setPending(parsed.data);
              setMode("idle");
            }}
          />
        </div>

        {pending ? (
          <div className="rounded-sm border border-border bg-background p-4">
            <p className="text-sm">
              Replace this journal with {pending.trades.length} trades from the file?
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

        {mode === "clear" ? (
          <div className="rounded-sm border border-border bg-background p-4">
            <p className="text-sm">Erase every trade? Rules and the starting balance stay.</p>
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
            <p className="text-sm">Replace trades, rules, and balance with the sample book?</p>
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
