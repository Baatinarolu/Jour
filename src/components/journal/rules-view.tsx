import { Button } from "@/components/ui/button";
import { todayKey } from "@/lib/journal/format";
import type { Checks, Rule } from "@/lib/journal/types";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export function RulesView({
  rules,
  checks,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
}: {
  rules: Rule[];
  checks: Checks;
  onToggle: (date: string, ruleId: string) => void;
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const today = todayKey();
  const done = new Set(checks[today] ?? []);
  const honored = rules.filter((rule) => done.has(rule.id)).length;

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-muted">{format(new Date(), "EEEE, MMM d")}</p>
      <p className="mt-2 font-mono text-3xl font-medium tabular-nums tracking-tight">
        {honored} of {rules.length}
      </p>
      <p className="mt-2 text-sm text-muted">
        Check a rule after the session, not when you want it to be true.
      </p>

      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rules.length === 0 ? (
          <li className="bg-card px-4 py-4 text-sm text-muted">No rules yet. Add the ones you actually break.</li>
        ) : (
          rules.map((rule) => {
            const checked = done.has(rule.id);
            return (
              <li key={rule.id} className="flex items-start gap-3 bg-card px-3 py-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(today, rule.id)}
                  aria-label={`Honored: ${rule.text}`}
                  className="mt-3 size-4 accent-accent"
                />
                <input
                  value={rule.text}
                  onChange={(event) => onUpdate(rule.id, event.target.value)}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (!next) onDelete(rule.id);
                    else if (next !== rule.text) onUpdate(rule.id, next);
                  }}
                  className="mt-1 min-h-11 w-full bg-transparent text-sm"
                />
                <button
                  type="button"
                  onClick={() => onDelete(rule.id)}
                  aria-label="Delete rule"
                  className="press inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-card-2 hover:text-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })
        )}
      </ul>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text || rules.length >= 12) return;
          onAdd(text);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a rule"
          aria-label="New rule"
          maxLength={180}
          className="h-11 w-full rounded-sm border border-border bg-card px-3 text-sm"
        />
        <Button type="submit" variant="secondary" disabled={!draft.trim() || rules.length >= 12}>
          Add
        </Button>
      </form>
    </div>
  );
}
