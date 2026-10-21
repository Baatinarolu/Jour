import { Button } from "@/components/ui/button";
import { AreaField, FieldLabel, TextField } from "@/components/ui/field";
import { journalStats, tradePnl, tradeR } from "@/lib/journal/calc";
import {
  dayKey,
  formatFactor,
  formatMoney,
  formatPct,
  formatR,
  pnlClass,
  sideLabel,
  todayKey,
} from "@/lib/journal/format";
import {
  dayTrades,
  shiftDayKey,
  weekEndKey,
  weekStartKey,
  weekTrades,
  weeklySnapshot,
} from "@/lib/journal/insights";
import { useJournal } from "@/lib/journal/store";
import {
  GRADES,
  type DayEntry,
  type Grade,
  type Playbook,
  type Trade,
  type WeeklyReview,
} from "@/lib/journal/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && todayKey(date) === value;
}

function formatKey(value: string, pattern: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : format(date, pattern);
}

function formatUnsignedR(value: number): string {
  return `${Math.abs(value).toFixed(2)}R`;
}

function totalTradeR(trades: readonly Trade[]): number {
  return trades.reduce((sum, trade) => sum + (tradeR(trade) ?? 0), 0);
}

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      {description ? <p className="mt-1 text-sm text-subtle">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint, className }: { label: string; value: string; hint: string; className?: string }) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-medium tabular-nums tracking-tight", className)}>{value}</p>
      <p className="mt-1 text-sm text-subtle">{hint}</p>
    </div>
  );
}

type DayDraft = {
  planFocus: string;
  planBias: string;
  planNotes: string;
  allowedPlaybookIds: string[];
  maxLossR: string;
  readiness: string;
  reviewWentWell: string;
  reviewMistakes: string;
  reviewLesson: string;
  reviewNotes: string;
  followedPlan: "unset" | "yes" | "no";
  dayGrade: string;
};

function toDayDraft(entry: DayEntry | null): DayDraft {
  return {
    planFocus: entry?.planFocus ?? "",
    planBias: entry?.planBias ?? "",
    planNotes: entry?.planNotes ?? "",
    allowedPlaybookIds: entry?.allowedPlaybookIds ?? [],
    maxLossR: entry?.maxLossR == null ? "" : String(entry.maxLossR),
    readiness: entry?.readiness == null ? "" : String(entry.readiness),
    reviewWentWell: entry?.reviewWentWell ?? "",
    reviewMistakes: entry?.reviewMistakes ?? "",
    reviewLesson: entry?.reviewLesson ?? "",
    reviewNotes: entry?.reviewNotes ?? "",
    followedPlan: entry?.followedPlan == null ? "unset" : entry.followedPlan ? "yes" : "no",
    dayGrade: entry?.dayGrade ?? "",
  };
}

function isBlankDayDraft(draft: DayDraft): boolean {
  return [
    draft.planFocus,
    draft.planBias,
    draft.planNotes,
    draft.maxLossR,
    draft.readiness,
    draft.reviewWentWell,
    draft.reviewMistakes,
    draft.reviewLesson,
    draft.reviewNotes,
    draft.dayGrade,
  ].every((value) => !value.trim()) && draft.allowedPlaybookIds.length === 0 && draft.followedPlan === "unset";
}

function DayEditor({
  date,
  entry,
  playbooks,
  onSave,
  onDelete,
}: {
  date: string;
  entry: DayEntry | null;
  playbooks: Playbook[];
  onSave: (entry: DayEntry) => void;
  onDelete: (date: string) => void;
}) {
  const [draft, setDraft] = useState<DayDraft>(() => toDayDraft(entry));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const baseline = toDayDraft(entry);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function update<K extends keyof DayDraft>(key: K, value: DayDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function save() {
    const maxLossText = draft.maxLossR.trim();
    const maxLossR = maxLossText ? Number(maxLossText) : null;
    if (maxLossText && (maxLossR == null || !Number.isFinite(maxLossR) || maxLossR < 0)) {
      setError("Maximum planned loss must be zero or more, expressed in R.");
      return;
    }

    const readinessText = draft.readiness.trim();
    const readiness = readinessText ? Number(readinessText) : undefined;
    if (readiness != null && (!Number.isInteger(readiness) || readiness < 1 || readiness > 5)) {
      setError("Readiness must be a whole number from 1 to 5.");
      return;
    }

    if (isBlankDayDraft(draft)) {
      setError(entry ? "Write something for this day, or delete the entry." : "Write at least one part of the plan or review before saving.");
      return;
    }

    const now = new Date().toISOString();
    const next: DayEntry = {
      date,
      planFocus: draft.planFocus.trim(),
      planBias: draft.planBias.trim(),
      planNotes: draft.planNotes.trim(),
      allowedPlaybookIds: draft.allowedPlaybookIds.filter((id) => playbooks.some((playbook) => playbook.id === id)),
      maxLossR,
      ...(readiness != null ? { readiness } : {}),
      reviewWentWell: draft.reviewWentWell.trim(),
      reviewMistakes: draft.reviewMistakes.trim(),
      reviewLesson: draft.reviewLesson.trim(),
      reviewNotes: draft.reviewNotes.trim(),
      ...(draft.followedPlan !== "unset" ? { followedPlan: draft.followedPlan === "yes" } : {}),
      ...(draft.dayGrade ? { dayGrade: draft.dayGrade as Grade } : {}),
      createdAt: entry?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(next);
    setError(null);
    setSaved(true);
    setConfirmDelete(false);
  }

  function remove() {
    onDelete(date);
    setDraft(toDayDraft(null));
    setError(null);
    setSaved(false);
    setConfirmDelete(false);
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Panel
        title="Before the session"
        description="Write the plan while the market cannot negotiate with you. One focus, allowed playbooks, and the loss that ends the day."
      >
        <div className="grid gap-4">
          <div>
            <FieldLabel htmlFor="day-plan-focus">One focus</FieldLabel>
            <TextField
              id="day-plan-focus"
              value={draft.planFocus}
              maxLength={500}
              onChange={(event) => update("planFocus", event.target.value)}
              placeholder="Example: Only take the first A-grade pullback. No second attempt."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="day-plan-bias">Bias & conditions</FieldLabel>
              <AreaField
                id="day-plan-bias"
                value={draft.planBias}
                maxLength={5000}
                onChange={(event) => update("planBias", event.target.value)}
                placeholder="What would make today long, short, range-bound, or a no-trade day?"
              />
            </div>
            <div>
              <FieldLabel htmlFor="day-plan-notes">Levels, events & invalidation</FieldLabel>
              <AreaField
                id="day-plan-notes"
                value={draft.planNotes}
                maxLength={5000}
                onChange={(event) => update("planNotes", event.target.value)}
                placeholder="Key levels, scheduled releases, session plan, and what proves the idea wrong."
              />
            </div>
          </div>

          <div>
            <FieldLabel>Allowed playbooks</FieldLabel>
            {playbooks.length ? (
              <div className="flex flex-wrap gap-2">
                {playbooks.map((playbook) => {
                  const active = draft.allowedPlaybookIds.includes(playbook.id);
                  return (
                    <button
                      key={playbook.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        update(
                          "allowedPlaybookIds",
                          active
                            ? draft.allowedPlaybookIds.filter((id) => id !== playbook.id)
                            : [...draft.allowedPlaybookIds, playbook.id],
                        )
                      }
                      className={cn(
                        "press h-11 rounded-sm px-3 text-sm",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "border border-border bg-background text-muted hover:text-foreground",
                      )}
                    >
                      {playbook.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted">Create a playbook in Rules & playbooks, then choose what is allowed today.</p>
            )}
            <p className="mt-2 text-sm text-subtle">Leave all unselected if you do not want to record a restriction for this day.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="day-max-loss">Maximum planned loss (R)</FieldLabel>
              <TextField
                id="day-max-loss"
                inputMode="decimal"
                value={draft.maxLossR}
                onChange={(event) => update("maxLossR", event.target.value)}
                placeholder="2"
              />
              <p className="mt-1 text-sm text-subtle">Used for the loss-budget meter above. It does not block trading.</p>
            </div>
            <div>
              <FieldLabel>Readiness before trading</FieldLabel>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Readiness from 1 to 5">
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = draft.readiness === String(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update("readiness", active ? "" : String(value))}
                      className={cn(
                        "press size-11 rounded-sm font-mono text-sm",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "border border-border bg-background text-muted hover:text-foreground",
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-sm text-subtle">1 = scattered, 5 = clear and rested. Tap again to clear.</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="After the session"
        description="Judge execution before outcome. A profitable rule-break is still a leak; a planned loss is useful information."
      >
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="day-review-well">What went well?</FieldLabel>
              <AreaField
                id="day-review-well"
                value={draft.reviewWentWell}
                maxLength={5000}
                onChange={(event) => update("reviewWentWell", event.target.value)}
                placeholder="Name the behavior you want to repeat, not just the winning trade."
              />
            </div>
            <div>
              <FieldLabel htmlFor="day-review-mistakes">What mistakes repeated?</FieldLabel>
              <AreaField
                id="day-review-mistakes"
                value={draft.reviewMistakes}
                maxLength={5000}
                onChange={(event) => update("reviewMistakes", event.target.value)}
                placeholder="Early entry, moved stop, revenge size, traded boredom…"
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="day-review-lesson">One lesson</FieldLabel>
            <AreaField
              id="day-review-lesson"
              value={draft.reviewLesson}
              maxLength={5000}
              onChange={(event) => update("reviewLesson", event.target.value)}
              placeholder="If tomorrow gives me the same situation, I will…"
            />
          </div>

          <div>
            <FieldLabel htmlFor="day-review-notes">Other notes</FieldLabel>
            <AreaField
              id="day-review-notes"
              value={draft.reviewNotes}
              maxLength={5000}
              onChange={(event) => update("reviewNotes", event.target.value)}
              placeholder="Market context, distractions, screenshots to revisit, or anything future-you needs."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <FieldLabel>Followed the day plan?</FieldLabel>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Followed the day plan">
                {([
                  ["unset", "Not marked"],
                  ["yes", "Yes"],
                  ["no", "No"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.followedPlan === value}
                    onClick={() => update("followedPlan", value)}
                    className={cn(
                      "press h-11 rounded-sm px-3 text-sm",
                      draft.followedPlan === value
                        ? "bg-accent text-accent-foreground"
                        : "border border-border bg-background text-muted hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Grade the execution</FieldLabel>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Day execution grade">
                {GRADES.map((grade) => {
                  const active = draft.dayGrade === grade;
                  return (
                    <button
                      key={grade}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update("dayGrade", active ? "" : grade)}
                      className={cn(
                        "press size-11 rounded-sm font-mono text-sm",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "border border-border bg-background text-muted hover:text-foreground",
                      )}
                    >
                      {grade}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
      {saved && !dirty ? <p className="text-sm text-up">Daily journal saved on this device.</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {entry ? (
          confirmDelete ? (
            <>
              <p className="text-sm text-muted sm:mr-auto">Delete this day’s plan and review?</p>
              <Button variant="danger" onClick={remove}>
                <Trash2 className="size-4" />
                Delete entry
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="ghost" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete entry
            </Button>
          )
        ) : null}
        <div className={cn("flex gap-2", !entry && "sm:ml-auto")}>
          <Button
            variant="secondary"
            disabled={!dirty}
            onClick={() => {
              setDraft(toDayDraft(entry));
              setError(null);
              setSaved(false);
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={!dirty}>
            Save daily journal
          </Button>
        </div>
      </div>
    </form>
  );
}

type WeeklyDraft = {
  keptDoing: string;
  stopDoing: string;
  bestTrade: string;
  worstTrade: string;
  biggestLesson: string;
  nextFocus: string;
  notes: string;
};

function toWeeklyDraft(review: WeeklyReview | null): WeeklyDraft {
  return {
    keptDoing: review?.keptDoing ?? "",
    stopDoing: review?.stopDoing ?? "",
    bestTrade: review?.bestTrade ?? "",
    worstTrade: review?.worstTrade ?? "",
    biggestLesson: review?.biggestLesson ?? "",
    nextFocus: review?.nextFocus ?? "",
    notes: review?.notes ?? "",
  };
}

function isBlankWeeklyDraft(draft: WeeklyDraft): boolean {
  return Object.values(draft).every((value) => !value.trim());
}

function describeTrade(trade: Trade): string {
  const context = trade.lesson?.trim() || trade.mistake?.trim() || trade.notes.trim() || trade.entryReason?.trim();
  return `${trade.symbol} ${sideLabel(trade.side)}${trade.setup ? ` · ${trade.setup}` : ""} — ${formatMoney(tradePnl(trade))} (${formatR(tradeR(trade))})${context ? `: ${context}` : ""}`;
}

function SnapshotStats({ snapshot }: { snapshot: WeeklyReview["snapshot"] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <div className="rounded-sm border border-border bg-background p-3">
        <dt className="text-sm text-muted">Net</dt>
        <dd className={cn("mt-1 font-mono text-base tabular-nums", pnlClass(snapshot.net))}>{formatMoney(snapshot.net)}</dd>
      </div>
      <div className="rounded-sm border border-border bg-background p-3">
        <dt className="text-sm text-muted">Total R</dt>
        <dd className="mt-1 font-mono text-base tabular-nums">{formatR(snapshot.totalR)}</dd>
      </div>
      <div className="rounded-sm border border-border bg-background p-3">
        <dt className="text-sm text-muted">Average R</dt>
        <dd className="mt-1 font-mono text-base tabular-nums">{formatR(snapshot.avgR)}</dd>
      </div>
      <div className="rounded-sm border border-border bg-background p-3">
        <dt className="text-sm text-muted">Profit factor</dt>
        <dd className="mt-1 font-mono text-base tabular-nums">{formatFactor(snapshot.profitFactor)}</dd>
      </div>
      <div className="rounded-sm border border-border bg-background p-3">
        <dt className="text-sm text-muted">Win rate</dt>
        <dd className="mt-1 font-mono text-base tabular-nums">{formatPct(snapshot.winRate)}</dd>
      </div>
      <div className="rounded-sm border border-border bg-background p-3">
        <dt className="text-sm text-muted">Plan rate</dt>
        <dd className="mt-1 font-mono text-base tabular-nums">{formatPct(snapshot.planRate)}</dd>
      </div>
    </dl>
  );
}

function WeeklyEditor({
  weekStart,
  existing,
  trades,
  onAdd,
  onUpdate,
  onDelete,
}: {
  weekStart: string;
  existing: WeeklyReview | null;
  trades: Trade[];
  onAdd: (review: WeeklyReview) => void;
  onUpdate: (review: WeeklyReview) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<WeeklyDraft>(() => toWeeklyDraft(existing));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const baseline = toWeeklyDraft(existing);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const currentSnapshot = useMemo(() => weeklySnapshot(trades), [trades]);
  const best = useMemo(
    () => [...trades].sort((a, b) => tradePnl(b) - tradePnl(a))[0] ?? null,
    [trades],
  );
  const worst = useMemo(
    () => [...trades].sort((a, b) => tradePnl(a) - tradePnl(b))[0] ?? null,
    [trades],
  );

  function update<K extends keyof WeeklyDraft>(key: K, value: WeeklyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function save() {
    if (isBlankWeeklyDraft(draft)) {
      setError(existing ? "Write something for this week, or delete the review." : "Answer at least one prompt before saving the weekly review.");
      return;
    }

    const now = new Date().toISOString();
    const trimmed = {
      keptDoing: draft.keptDoing.trim(),
      stopDoing: draft.stopDoing.trim(),
      bestTrade: draft.bestTrade.trim(),
      worstTrade: draft.worstTrade.trim(),
      biggestLesson: draft.biggestLesson.trim(),
      nextFocus: draft.nextFocus.trim(),
      notes: draft.notes.trim(),
    };

    if (existing) {
      onUpdate({
        ...existing,
        ...trimmed,
        weekStart,
        weekEnd: weekEndKey(weekStart),
        snapshot: currentSnapshot,
        updatedAt: now,
      });
    } else {
      onAdd({
        id: crypto.randomUUID(),
        weekStart,
        weekEnd: weekEndKey(weekStart),
        ...trimmed,
        snapshot: currentSnapshot,
        createdAt: now,
        updatedAt: now,
      });
    }
    setError(null);
    setSaved(true);
    setConfirmDelete(false);
  }

  function remove() {
    if (!existing) return;
    onDelete(existing.id);
    setDraft(toWeeklyDraft(null));
    setError(null);
    setSaved(false);
    setConfirmDelete(false);
  }

  const fields: { key: keyof WeeklyDraft; label: string; placeholder: string }[] = [
    { key: "keptDoing", label: "Keep doing", placeholder: "The behavior or condition that actually made money or protected it." },
    { key: "stopDoing", label: "Stop doing", placeholder: "The repeatable leak to remove before adding anything new." },
    { key: "bestTrade", label: "Best trade & why", placeholder: "Judge the process: location, criteria, sizing, management." },
    { key: "worstTrade", label: "Worst trade & why", placeholder: "What broke first—the idea, the entry, the size, or the exit?" },
    { key: "biggestLesson", label: "Biggest lesson", placeholder: "One sentence future-you can act on." },
    { key: "nextFocus", label: "One focus next week", placeholder: "Make it observable. Example: no entries before the level and trigger both appear." },
  ];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <SnapshotStats snapshot={currentSnapshot} />
      <p className="mt-2 text-sm text-subtle">
        {currentSnapshot.trades} closed trades in this week. Saving stores this snapshot with your words, even if a trade is edited later.
        {existing ? " Editing will refresh the saved snapshot." : ""}
      </p>

      {(best || worst) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {best ? (
            <Button size="sm" variant="secondary" onClick={() => update("bestTrade", describeTrade(best))}>
              Use best P&L trade
            </Button>
          ) : null}
          {worst && worst.id !== best?.id ? (
            <Button size="sm" variant="secondary" onClick={() => update("worstTrade", describeTrade(worst))}>
              Use worst P&L trade
            </Button>
          ) : null}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key}>
            <FieldLabel htmlFor={`weekly-${field.key}`}>{field.label}</FieldLabel>
            <AreaField
              id={`weekly-${field.key}`}
              value={draft[field.key]}
              maxLength={5000}
              onChange={(event) => update(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
        <div className="md:col-span-2">
          <FieldLabel htmlFor="weekly-notes">Notes</FieldLabel>
          <AreaField
            id="weekly-notes"
            value={draft.notes}
            maxLength={5000}
            onChange={(event) => update("notes", event.target.value)}
            placeholder="Anything else about the week: conditions, schedule, energy, or experiments."
          />
        </div>
      </div>

      {existing ? (
        <p className="mt-3 text-sm text-subtle">
          Saved snapshot: {existing.snapshot.trades} trades · {formatMoney(existing.snapshot.net)} · {formatR(existing.snapshot.totalR)}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-down">
          {error}
        </p>
      ) : null}
      {saved && !dirty ? <p className="mt-3 text-sm text-up">Weekly review saved on this device.</p> : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {existing ? (
          confirmDelete ? (
            <>
              <p className="text-sm text-muted sm:mr-auto">Delete this weekly review?</p>
              <Button variant="danger" onClick={remove}>
                <Trash2 className="size-4" />
                Delete review
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="ghost" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
              Delete review
            </Button>
          )
        ) : null}
        <div className={cn("flex gap-2", !existing && "sm:ml-auto")}>
          <Button
            variant="secondary"
            disabled={!dirty}
            onClick={() => {
              setDraft(toWeeklyDraft(existing));
              setError(null);
              setSaved(false);
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={!dirty}>
            {existing ? "Save weekly review" : "Create weekly review"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function DailyView({
  trades,
  playbooks,
  onEdit,
  onCreate,
}: {
  trades: Trade[];
  playbooks: Playbook[];
  onEdit: (trade: Trade) => void;
  onCreate: () => void;
}) {
  const dayEntries = useJournal((state) => state.dayEntries);
  const weeklyReviews = useJournal((state) => state.weeklyReviews);
  const saveDayEntry = useJournal((state) => state.saveDayEntry);
  const deleteDayEntry = useJournal((state) => state.deleteDayEntry);
  const addWeeklyReview = useJournal((state) => state.addWeeklyReview);
  const updateWeeklyReview = useJournal((state) => state.updateWeeklyReview);
  const deleteWeeklyReview = useJournal((state) => state.deleteWeeklyReview);

  const today = todayKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekCursor, setWeekCursor] = useState(today);

  const selectedEntry = dayEntries[selectedDate] ?? null;
  const selectedTrades = useMemo(() => dayTrades(trades, selectedDate), [trades, selectedDate]);
  const selectedStats = useMemo(() => journalStats(selectedTrades, 0), [selectedTrades]);
  const selectedTotalR = useMemo(() => totalTradeR(selectedTrades), [selectedTrades]);
  const tradesWithoutR = selectedTrades.filter((trade) => tradeR(trade) == null).length;
  const maxLossR = selectedEntry?.maxLossR ?? null;
  const lossUsedR = Math.max(0, -selectedTotalR);
  const lossBudgetPct = maxLossR == null ? 0 : maxLossR === 0 ? (lossUsedR > 0 ? 100 : 0) : Math.min(100, (lossUsedR / maxLossR) * 100);

  const recentDays = useMemo(() => {
    const byDate = new Map<string, Trade[]>();
    for (const trade of trades) {
      const key = dayKey(trade.closedAt);
      const list = byDate.get(key);
      if (list) list.push(trade);
      else byDate.set(key, [trade]);
    }
    const dates = new Set<string>([...byDate.keys(), ...Object.keys(dayEntries)]);
    return [...dates]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 14)
      .map((date) => {
        const list = byDate.get(date) ?? [];
        return {
          date,
          entry: dayEntries[date] ?? null,
          trades: list,
          net: list.reduce((sum, trade) => sum + tradePnl(trade), 0),
          totalR: totalTradeR(list),
        };
      });
  }, [trades, dayEntries]);

  const selectedWeekStart = weekStartKey(weekCursor);
  const selectedWeekEnd = weekEndKey(selectedWeekStart);
  const selectedWeekTrades = useMemo(
    () => weekTrades(trades, selectedWeekStart),
    [trades, selectedWeekStart],
  );
  const existingWeeklyReview = weeklyReviews.find((review) => review.weekStart === selectedWeekStart) ?? null;
  const selectedWeekEntries = useMemo(
    () =>
      Object.values(dayEntries)
        .filter((entry) => entry.date >= selectedWeekStart && entry.date <= selectedWeekEnd)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [dayEntries, selectedWeekEnd, selectedWeekStart],
  );

  const relation =
    selectedDate === today
      ? "Today"
      : selectedDate === shiftDayKey(today, -1)
        ? "Yesterday"
        : selectedDate === shiftDayKey(today, 1)
          ? "Tomorrow"
          : selectedDate > today
            ? "Planning ahead"
            : "Past trading day";

  return (
    <div className="grid gap-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-up">{relation}</p>
            <h2 className="mt-1 text-2xl font-medium tracking-tight">
              {formatKey(selectedDate, "EEEE, MMMM d, yyyy")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Plan the session before it starts, then close the loop after the last trade. Everything stays in this browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous day"
              onClick={() => setSelectedDate((current) => shiftDayKey(current, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="w-44">
              <label htmlFor="daily-date" className="sr-only">
                Journal date
              </label>
              <TextField
                id="daily-date"
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  if (isValidDayKey(event.target.value)) setSelectedDate(event.target.value);
                }}
              />
            </div>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next day"
              onClick={() => setSelectedDate((current) => shiftDayKey(current, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="secondary" onClick={() => setSelectedDate(today)}>
              Today
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Net P&L" value={formatMoney(selectedStats.net)} hint={selectedTrades.length ? "Closed trades only" : "No closes yet"} className={pnlClass(selectedStats.net)} />
          <Stat label="Total R" value={formatR(selectedTotalR)} hint={tradesWithoutR ? `${tradesWithoutR} without R` : "Stop-defined trades"} />
          <Stat
            label="Trades"
            value={String(selectedStats.count)}
            hint={`${selectedStats.wins}W · ${selectedStats.losses}L${selectedStats.scratches ? ` · ${selectedStats.scratches} flat` : ""}`}
          />
          <Stat label="Win rate" value={formatPct(selectedStats.winRate)} hint={selectedStats.avgR == null ? "No R sample" : `${formatR(selectedStats.avgR)} average`} />
        </div>

        {maxLossR != null ? (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Daily loss budget</p>
              <p className="font-mono text-sm tabular-nums text-muted">
                {formatUnsignedR(lossUsedR)} of {formatUnsignedR(maxLossR)} used
              </p>
            </div>
            <div className="mt-2 h-2 rounded-sm bg-card-2" aria-hidden="true">
              <div
                className={cn("h-2 rounded-sm", lossBudgetPct >= 100 ? "bg-down" : "bg-accent")}
                style={{ width: `${lossBudgetPct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-subtle">
              {selectedTotalR >= 0
                ? "No loss budget has been used by the closed trades recorded for this day."
                : lossBudgetPct >= 100
                  ? "The planned daily loss budget has been reached."
                  : `${formatUnsignedR(Math.max(0, maxLossR - lossUsedR))} of planned downside remains.`}
              {tradesWithoutR ? ` ${tradesWithoutR} trade${tradesWithoutR === 1 ? " has" : "s have"} no R value and cannot move this meter.` : ""}
            </p>
          </div>
        ) : (
          <p className="mt-4 border-t border-border pt-4 text-sm text-subtle">
            Add a maximum planned loss in the plan below to see today’s R against a daily budget.
          </p>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-muted">Closed trades</h3>
            <Button size="sm" variant="secondary" onClick={onCreate}>
              <Plus className="size-4" />
              Log a trade
            </Button>
          </div>
          {selectedTrades.length ? (
            <ul className="mt-3 grid gap-2">
              {selectedTrades.map((trade) => {
                const pnl = tradePnl(trade);
                return (
                  <li key={trade.id}>
                    <button
                      type="button"
                      onClick={() => onEdit(trade)}
                      className="press flex w-full items-center justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2 text-left hover:bg-card-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {trade.symbol} · {sideLabel(trade.side)}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-subtle">
                          {format(new Date(trade.closedAt), "HH:mm")} · {trade.setup || "No setup"} · Grade {trade.grade}
                          {trade.followedPlan ? "" : " · Off plan"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn("block font-mono text-sm tabular-nums", pnlClass(pnl))}>{formatMoney(pnl)}</span>
                        <span className="block font-mono text-sm tabular-nums text-muted">{formatR(tradeR(trade))}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No closes logged for this day yet. The plan can still be written before the session.</p>
          )}
        </div>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <DayEditor
          key={selectedDate}
          date={selectedDate}
          entry={selectedEntry}
          playbooks={playbooks}
          onSave={saveDayEntry}
          onDelete={deleteDayEntry}
        />

        <Panel title="Recent days" description="Trading days and journal entries, newest first." className="lg:sticky lg:top-6">
          {recentDays.length ? (
            <ul className="grid gap-2">
              {recentDays.map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    aria-current={selectedDate === day.date ? "date" : undefined}
                    onClick={() => setSelectedDate(day.date)}
                    className={cn(
                      "w-full rounded-sm border px-3 py-2 text-left",
                      selectedDate === day.date ? "border-accent bg-card-2" : "border-border bg-background hover:bg-card-2",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{formatKey(day.date, "EEE, MMM d")}</span>
                      <span className={cn("font-mono text-sm tabular-nums", pnlClass(day.net))}>{formatMoney(day.net)}</span>
                    </span>
                    <span className="mt-1 block text-sm text-subtle">
                      {day.trades.length} trades · {formatR(day.totalR)}
                      {day.entry?.dayGrade ? ` · Grade ${day.entry.dayGrade}` : day.entry ? " · Journal saved" : " · No journal"}
                    </span>
                    {day.entry?.reviewLesson ? (
                      <span className="mt-1 line-clamp-2 block text-sm text-muted">{day.entry.reviewLesson}</span>
                    ) : day.entry?.planFocus ? (
                      <span className="mt-1 line-clamp-2 block text-sm text-muted">Focus: {day.entry.planFocus}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Log a trade or save today’s plan and it will appear here.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Guided weekly review"
        description="Turn the week into one decision for the next one. Stats are snapshotted when you save."
      >
        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-medium tracking-tight">
              {formatKey(selectedWeekStart, "MMM d")} – {formatKey(selectedWeekEnd, "MMM d, yyyy")}
            </h3>
            <p className="mt-1 text-sm text-subtle">
              {selectedWeekStart === weekStartKey(today) ? "This week" : "Monday–Sunday week"}
              {existingWeeklyReview ? " · Review saved" : " · No review saved yet"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous week"
              onClick={() => setWeekCursor((current) => shiftDayKey(weekStartKey(current), -7))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="w-44">
              <label htmlFor="weekly-date" className="sr-only">
                Week containing date
              </label>
              <TextField
                id="weekly-date"
                type="date"
                value={weekCursor}
                onChange={(event) => {
                  if (isValidDayKey(event.target.value)) setWeekCursor(event.target.value);
                }}
              />
            </div>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next week"
              onClick={() => setWeekCursor((current) => shiftDayKey(weekStartKey(current), 7))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="secondary" onClick={() => setWeekCursor(today)}>
              This week
            </Button>
          </div>
        </div>

        <WeeklyEditor
          key={`${selectedWeekStart}-${existingWeeklyReview?.id ?? "new"}`}
          weekStart={selectedWeekStart}
          existing={existingWeeklyReview}
          trades={selectedWeekTrades}
          onAdd={addWeeklyReview}
          onUpdate={updateWeeklyReview}
          onDelete={deleteWeeklyReview}
        />

        {selectedWeekEntries.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-muted">From this week’s daily journal</h3>
            <ul className="mt-3 grid gap-2">
              {selectedWeekEntries.map((entry) => (
                <li key={entry.date} className="rounded-sm border border-border bg-background p-3">
                  <p className="text-sm font-medium">{formatKey(entry.date, "EEEE, MMM d")}</p>
                  {entry.planFocus ? <p className="mt-1 text-sm text-muted"><span className="text-subtle">Focus:</span> {entry.planFocus}</p> : null}
                  {entry.reviewLesson ? <p className="mt-1 text-sm text-muted"><span className="text-subtle">Lesson:</span> {entry.reviewLesson}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {weeklyReviews.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-muted">Past weekly reviews</h3>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {weeklyReviews.map((review) => (
                <li key={review.id}>
                  <button
                    type="button"
                    aria-current={selectedWeekStart === review.weekStart ? "true" : undefined}
                    onClick={() => setWeekCursor(review.weekStart)}
                    className={cn(
                      "w-full rounded-sm border px-3 py-3 text-left",
                      selectedWeekStart === review.weekStart
                        ? "border-accent bg-card-2"
                        : "border-border bg-background hover:bg-card-2",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">
                        {formatKey(review.weekStart, "MMM d")} – {formatKey(review.weekEnd, "MMM d")}
                      </span>
                      <span className={cn("font-mono text-sm tabular-nums", pnlClass(review.snapshot.net))}>
                        {formatMoney(review.snapshot.net)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-subtle">
                      {review.snapshot.trades} trades · {formatR(review.snapshot.totalR)} · {formatPct(review.snapshot.winRate)} wins
                    </span>
                    {review.nextFocus ? (
                      <span className="mt-2 line-clamp-2 block text-sm text-muted">Next: {review.nextFocus}</span>
                    ) : review.biggestLesson ? (
                      <span className="mt-2 line-clamp-2 block text-sm text-muted">Lesson: {review.biggestLesson}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
