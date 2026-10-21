import { Button } from "@/components/ui/button";
import { ruleHistory } from "@/lib/journal/calc";
import { todayKey } from "@/lib/journal/format";
import type { Checks, Rule } from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

function RuleRow({
  rule,
  checked,
  onToggle,
  onUpdate,
  onDelete,
}: {
  rule: Rule;
  checked: boolean;
  onToggle: () => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [text, setText] = useState(rule.text);

  useEffect(() => setText(rule.text), [rule.text]);

  function commit() {
    const next = text.trim();
    if (!next) {
      setText(rule.text);
      return;
    }
    if (next !== rule.text) onUpdate(rule.id, next);
  }

  return (
    <li className="flex items-start gap-3 bg-card px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Honored: ${rule.text}`}
        className="mt-3 size-4 accent-accent"
      />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setText(rule.text);
            event.currentTarget.blur();
          }
        }}
        aria-label="Rule text"
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
}

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
  const history = ruleHistory(checks, rules, 14);

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
          rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              checked={done.has(rule.id)}
              onToggle={() => onToggle(today, rule.id)}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))
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

      {rules.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted">Last 14 days</h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {history.slice().reverse().map((day) => (
              <li key={day.date} className="flex items-center gap-3 bg-card px-4 py-3">
                <span className="w-28 shrink-0 text-sm text-muted">
                  {day.date === today ? "Today" : format(new Date(`${day.date}T12:00:00`), "EEE, MMM d")}
                </span>
                <span className="hidden h-2 min-w-0 flex-1 rounded-sm bg-card-2 sm:block" aria-hidden="true">
                  <span
                    className={cn("block h-2 rounded-sm", day.honored === day.total && day.total > 0 ? "bg-up" : "bg-accent")}
                    style={{ width: `${(day.ratio ?? 0) * 100}%` }}
                  />
                </span>
                <span className="ml-auto font-mono text-sm tabular-nums sm:ml-0">
                  {day.honored} of {day.total}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-subtle">Earlier days are scored against today&apos;s rule list.</p>
        </section>
      ) : null}
    </div>
  );
}
