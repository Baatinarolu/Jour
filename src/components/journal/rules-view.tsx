import { Button } from "@/components/ui/button";
import { AreaField, FieldLabel, TextField } from "@/components/ui/field";
import { journalStats, ruleHistory } from "@/lib/journal/calc";
import { formatMoney, formatPct, formatR, marketLabel, sessionLabel } from "@/lib/journal/format";
import { presetPlaybooks } from "@/lib/journal/playbooks";
import { useJournal } from "@/lib/journal/store";
import { todayKey } from "@/lib/journal/format";
import { MARKETS, SESSIONS, type Checks, type Market, type Playbook, type Rule, type Session } from "@/lib/journal/types";
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


type PlaybookDraft = {
  id: string | null;
  name: string;
  description: string;
  markets: Market[];
  sessions: Session[];
  timeframes: string;
  criteria: string;
  invalidation: string;
  management: string;
  notes: string;
  exampleScreenshot: string;
  createdAt: string | null;
};

function playbookDraft(playbook: Playbook | null): PlaybookDraft {
  if (!playbook) {
    return {
      id: null,
      name: "",
      description: "",
      markets: [],
      sessions: [],
      timeframes: "15m",
      criteria: "",
      invalidation: "",
      management: "",
      notes: "",
      exampleScreenshot: "",
      createdAt: null,
    };
  }
  return {
    id: playbook.id,
    name: playbook.name,
    description: playbook.description,
    markets: playbook.markets,
    sessions: playbook.sessions,
    timeframes: playbook.timeframes.join(", "),
    criteria: playbook.entryCriteria.join("\n"),
    invalidation: playbook.invalidation,
    management: playbook.managementRules.join("\n"),
    notes: playbook.notes,
    exampleScreenshot: playbook.exampleScreenshot,
    createdAt: playbook.createdAt,
  };
}

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function PlaybooksPanel() {
  const playbooks = useJournal((state) => state.playbooks);
  const trades = useJournal((state) => state.trades);
  const startingBalance = useJournal((state) => state.startingBalance);
  const activePlaybookId = useJournal((state) => state.activePlaybookId);
  const addPlaybook = useJournal((state) => state.addPlaybook);
  const updatePlaybook = useJournal((state) => state.updatePlaybook);
  const deletePlaybook = useJournal((state) => state.deletePlaybook);
  const setActivePlaybook = useJournal((state) => state.setActivePlaybook);
  const [selectedId, setSelectedId] = useState<string>("new");
  const [draft, setDraft] = useState<PlaybookDraft>(() => playbookDraft(null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId === "new") {
      setDraft(playbookDraft(null));
      return;
    }
    const found = playbooks.find((item) => item.id === selectedId) ?? null;
    setDraft(playbookDraft(found));
  // Draft intentionally refreshes only when the selection changes, not on every playbook save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function set<K extends keyof PlaybookDraft>(key: K, value: PlaybookDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save() {
    const name = draft.name.trim();
    if (!name) {
      setError("Give the playbook a name.");
      return;
    }
    const now = new Date().toISOString();
    const playbook: Playbook = {
      id: draft.id ?? crypto.randomUUID(),
      name,
      description: draft.description.trim(),
      markets: draft.markets,
      sessions: draft.sessions,
      timeframes: draft.timeframes.split(",").map((item) => item.trim()).filter(Boolean),
      entryCriteria: lines(draft.criteria),
      invalidation: draft.invalidation.trim(),
      managementRules: lines(draft.management),
      notes: draft.notes.trim(),
      exampleScreenshot: draft.exampleScreenshot,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
    };
    if (draft.id) updatePlaybook(playbook);
    else addPlaybook(playbook);
    setSelectedId(playbook.id);
    setDraft(playbookDraft(playbook));
    setError(null);
  }

  function duplicate() {
    if (!draft.id) return;
    const now = new Date().toISOString();
    const copy: Playbook = {
      id: crypto.randomUUID(),
      name: `${draft.name || "Playbook"} copy`,
      description: draft.description,
      markets: draft.markets,
      sessions: draft.sessions,
      timeframes: draft.timeframes.split(",").map((item) => item.trim()).filter(Boolean),
      entryCriteria: lines(draft.criteria),
      invalidation: draft.invalidation,
      managementRules: lines(draft.management),
      notes: draft.notes,
      exampleScreenshot: draft.exampleScreenshot,
      createdAt: now,
      updatedAt: now,
    };
    addPlaybook(copy);
    setSelectedId(copy.id);
  }

  return (
    <section className="mt-10 border-t border-border pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-medium tracking-tight">Playbooks</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Write the setup before it appears. The criteria become the checklist in the trade form, and plan stats show whether the document matches reality.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSelectedId("new")}>New playbook</Button>
          <Button
            variant="ghost"
            onClick={() => {
              for (const preset of presetPlaybooks()) {
                if (!playbooks.some((item) => item.id === preset.id)) addPlaybook(preset);
              }
            }}
          >
            Restore presets
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {playbooks.map((playbook) => {
          const matching = trades.filter((trade) => trade.playbookId === playbook.id || (!trade.playbookId && trade.setup === playbook.name));
          const stats = journalStats(matching, startingBalance);
          const compliance = matching.length ? matching.filter((trade) => trade.followedPlan).length / matching.length : null;
          return (
            <button
              key={playbook.id}
              type="button"
              onClick={() => setSelectedId(playbook.id)}
              aria-current={selectedId === playbook.id ? "true" : undefined}
              className={cn("rounded-xl border border-border bg-card p-4 text-left", selectedId === playbook.id && "bg-card-2")}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium">{playbook.name}{activePlaybookId === playbook.id ? <span className="ml-2 text-sm font-normal text-up">Active</span> : null}</span>
                <span className={cn("font-mono text-sm tabular-nums", stats.net > 0 ? "text-up" : stats.net < 0 ? "text-down" : "text-muted")}>{formatMoney(stats.net)}</span>
              </span>
              <span className="mt-1 block text-sm text-muted">{playbook.description || "No description yet."}</span>
              <span className="mt-2 block text-sm text-subtle">
                {stats.count} trades · {formatPct(stats.winRate)} wins · {formatR(stats.avgR)} avg · {formatPct(compliance)} compliant
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-muted">{draft.id ? "Edit playbook" : "Create playbook"}</h3>
        {error ? <p role="alert" className="mt-3 text-sm text-down">{error}</p> : null}
        <div className="mt-4 grid gap-4">
          <div><FieldLabel htmlFor="playbook-name">Name</FieldLabel><TextField id="playbook-name" value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="London sweep + retest" /></div>
          <div><FieldLabel htmlFor="playbook-description">What is the idea?</FieldLabel><AreaField id="playbook-description" className="min-h-20" value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="One paragraph: location, trigger and target logic." /></div>
          <div>
            <FieldLabel>Markets</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {MARKETS.map((market) => {
                const active = draft.markets.includes(market);
                return <button key={market} type="button" aria-pressed={active} onClick={() => set("markets", active ? draft.markets.filter((item) => item !== market) : [...draft.markets, market])} className={cn("press h-11 rounded-sm px-3 text-sm", active ? "bg-accent text-accent-foreground" : "border border-border bg-background text-muted")}>{marketLabel(market)}</button>;
              })}
            </div>
          </div>
          <div>
            <FieldLabel>Sessions</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {SESSIONS.map((session) => {
                const active = draft.sessions.includes(session);
                return <button key={session} type="button" aria-pressed={active} onClick={() => set("sessions", active ? draft.sessions.filter((item) => item !== session) : [...draft.sessions, session])} className={cn("press h-11 rounded-sm px-3 text-sm", active ? "bg-accent text-accent-foreground" : "border border-border bg-background text-muted")}>{sessionLabel(session)}</button>;
              })}
            </div>
          </div>
          <div><FieldLabel htmlFor="playbook-timeframes">Timeframes</FieldLabel><TextField id="playbook-timeframes" value={draft.timeframes} onChange={(event) => set("timeframes", event.target.value)} placeholder="15m, 1H, 4H" /></div>
          <div><FieldLabel htmlFor="playbook-criteria">Entry criteria (one per line)</FieldLabel><AreaField id="playbook-criteria" value={draft.criteria} onChange={(event) => set("criteria", event.target.value)} placeholder={"Higher-timeframe trend is clear\nPrice reached the planned zone\nTrigger confirmed"} /></div>
          <div><FieldLabel htmlFor="playbook-invalidation">Invalidation</FieldLabel><AreaField id="playbook-invalidation" className="min-h-20" value={draft.invalidation} onChange={(event) => set("invalidation", event.target.value)} placeholder="The price/event that proves the idea wrong." /></div>
          <div><FieldLabel htmlFor="playbook-management">Management rules (one per line)</FieldLabel><AreaField id="playbook-management" value={draft.management} onChange={(event) => set("management", event.target.value)} placeholder={"Partial at 1R\nTrail behind structure\nNo second attempt"} /></div>
          <div><FieldLabel htmlFor="playbook-notes">Strategy notes / common mistakes</FieldLabel><AreaField id="playbook-notes" value={draft.notes} onChange={(event) => set("notes", event.target.value)} /></div>
          <div>
            <FieldLabel htmlFor="playbook-example">Example chart</FieldLabel>
            <input
              id="playbook-example"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-sm file:border file:border-border file:bg-card-2 file:px-3 file:text-foreground"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > 2_500_000) {
                  setError("Playbook example is too large. Use an image under 2.5 MB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => set("exampleScreenshot", String(reader.result));
                reader.onerror = () => setError("That example image could not be read.");
                reader.readAsDataURL(file);
              }}
            />
            {draft.exampleScreenshot ? (
              <div className="mt-3 overflow-hidden rounded-sm border border-border">
                <img src={draft.exampleScreenshot} alt="Playbook example chart" className="max-h-80 w-full object-contain" />
                <div className="flex justify-end border-t border-border p-2"><Button variant="ghost" size="sm" onClick={() => set("exampleScreenshot", "")}>Remove example</Button></div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {draft.id ? (
              <>
                <Button variant="danger" className="sm:mr-auto" onClick={() => { deletePlaybook(draft.id!); setSelectedId("new"); }}>Delete</Button>
                <Button variant="secondary" onClick={duplicate}>Duplicate</Button>
                <Button variant="secondary" disabled={activePlaybookId === draft.id} onClick={() => draft.id && setActivePlaybook(draft.id)}>Set active</Button>
              </>
            ) : null}
            <Button onClick={save}>{draft.id ? "Save playbook" : "Create playbook"}</Button>
          </div>
        </div>
      </div>
    </section>
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
      <PlaybooksPanel />
    </div>
  );
}
