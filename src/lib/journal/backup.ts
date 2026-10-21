import { z } from "zod";
import { presetPlaybooks } from "./playbooks.ts";
import {
  EMOTIONS,
  GRADES,
  MARKETS,
  SESSIONS,
  SIDES,
  type JournalBackup,
  type Playbook,
  type Trade,
} from "./types.ts";

const dateString = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const baseTradeFields = {
  id: z.string().min(1),
  symbol: z.string().min(1),
  market: z.enum(MARKETS),
  side: z.enum(SIDES),
  openedAt: dateString,
  closedAt: dateString,
  entry: z.number().finite(),
  exit: z.number().finite(),
  quantity: z.number().positive().finite(),
  stop: z.number().finite().nullable(),
  fees: z.number().nonnegative().finite(),
  setup: z.string(),
  session: z.enum(SESSIONS),
  grade: z.enum(GRADES),
  followedPlan: z.boolean(),
  notes: z.string(),
  tags: z.array(z.string()),
};

function requireOrderedDates<T extends { openedAt: string; closedAt: string }>(
  trade: T,
  ctx: z.RefinementCtx,
) {
  if (Date.parse(trade.closedAt) < Date.parse(trade.openedAt)) {
    ctx.addIssue({ code: "custom", message: "Trade closes before it opens", path: ["closedAt"] });
  }
}

const tradeSchemaV1 = z.object(baseTradeFields).superRefine(requireOrderedDates);
const tradeSchemaV2 = z
  .object({ ...baseTradeFields, multiplier: z.number().positive().finite() })
  .superRefine(requireOrderedDates);

const imageDataUrl = z
  .string()
  .max(5_000_000)
  .refine((value) => value === "" || value.startsWith("data:image/"), "Screenshot must be an image data URL");

const tradeSchemaV3 = z
  .object({
    ...baseTradeFields,
    multiplier: z.number().positive().finite(),
    account: z.string().max(120).optional(),
    playbookId: z.string().nullable().optional(),
    target: z.number().finite().nullable().optional(),
    timeframe: z.string().max(40).optional(),
    tvSymbol: z.string().max(160).optional(),
    entryEmotion: z.enum(EMOTIONS).optional(),
    exitEmotion: z.enum(EMOTIONS).optional(),
    confidence: z.number().finite().optional(),
    mistake: z.string().max(500).optional(),
    lesson: z.string().max(5000).optional(),
    entryReason: z.string().max(5000).optional(),
    exitReason: z.string().max(5000).optional(),
    screenshots: z.array(imageDataUrl).max(3).optional(),
    voiceNote: z.string().max(10000).optional(),
    criteriaChecked: z.array(z.string().max(500)).max(50).optional(),
    mae: z.number().finite().nullable().optional(),
    mfe: z.number().finite().nullable().optional(),
    source: z.enum(["manual", "csv", "sample"]).optional(),
    externalId: z.string().max(300).optional(),
    createdAt: dateString.optional(),
    updatedAt: dateString.optional(),
  })
  .superRefine(requireOrderedDates);

const ruleSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });
const checksSchema = z.record(z.string(), z.array(z.string()));

const playbookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160),
  description: z.string().max(5000),
  markets: z.array(z.enum(MARKETS)).max(MARKETS.length),
  sessions: z.array(z.enum(SESSIONS)).max(SESSIONS.length),
  timeframes: z.array(z.string().max(40)).max(20),
  entryCriteria: z.array(z.string().min(1).max(500)).max(30),
  invalidation: z.string().max(5000),
  managementRules: z.array(z.string().min(1).max(500)).max(30),
  notes: z.string().max(5000),
  exampleScreenshot: imageDataUrl,
  createdAt: dateString,
  updatedAt: dateString,
});

const backupSchema = z.union([
  z.object({
    version: z.literal(1),
    startingBalance: z.number().nonnegative().finite(),
    trades: z.array(tradeSchemaV1),
    rules: z.array(ruleSchema),
    checks: checksSchema,
    sampleBanner: z.boolean(),
  }),
  z.object({
    version: z.literal(2),
    startingBalance: z.number().nonnegative().finite(),
    trades: z.array(tradeSchemaV2),
    rules: z.array(ruleSchema),
    checks: checksSchema,
    sampleBanner: z.boolean(),
  }),
  z.object({
    version: z.literal(3),
    startingBalance: z.number().nonnegative().finite(),
    trades: z.array(tradeSchemaV3),
    rules: z.array(ruleSchema),
    checks: checksSchema,
    sampleBanner: z.boolean(),
    playbooks: z.array(playbookSchema),
    activePlaybookId: z.string().nullable(),
  }),
]);

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBackup(data: z.infer<typeof backupSchema>): JournalBackup {
  const playbooks: Playbook[] = data.version === 3
    ? uniqueById(data.playbooks).map((playbook) => ({
        ...playbook,
        name: playbook.name.trim(),
        description: playbook.description.trim(),
        markets: [...new Set(playbook.markets)],
        sessions: [...new Set(playbook.sessions)],
        timeframes: [...new Set(playbook.timeframes.map((item) => item.trim()).filter(Boolean))],
        entryCriteria: playbook.entryCriteria.map((item) => item.trim()).filter(Boolean),
        invalidation: playbook.invalidation.trim(),
        managementRules: playbook.managementRules.map((item) => item.trim()).filter(Boolean),
        notes: playbook.notes.trim(),
      }))
    : presetPlaybooks();
  const playbookIds = new Set(playbooks.map((item) => item.id));
  const activePlaybookId = data.version === 3 && data.activePlaybookId && playbookIds.has(data.activePlaybookId)
    ? data.activePlaybookId
    : (playbooks[0]?.id ?? null);

  const trades: Trade[] = uniqueById(data.trades).map((trade) => {
    const rich = trade as typeof trade & Partial<Trade>;
    return {
      ...trade,
      symbol: trade.symbol.trim().toUpperCase(),
      multiplier:
        "multiplier" in trade && typeof trade.multiplier === "number" && trade.multiplier > 0
          ? trade.multiplier
          : 1,
      setup: trade.setup.trim(),
      notes: trade.notes.trim(),
      tags: [...new Set(trade.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
      account: cleanOptional(rich.account) ?? "Main",
      playbookId: rich.playbookId && playbookIds.has(rich.playbookId) ? rich.playbookId : null,
      target: typeof rich.target === "number" && Number.isFinite(rich.target) ? rich.target : null,
      timeframe: cleanOptional(rich.timeframe) ?? "",
      tvSymbol: cleanOptional(rich.tvSymbol)?.toUpperCase() ?? "",
      entryEmotion: rich.entryEmotion,
      exitEmotion: rich.exitEmotion,
      confidence:
        typeof rich.confidence === "number" && Number.isFinite(rich.confidence)
          ? Math.min(5, Math.max(1, Math.round(rich.confidence)))
          : undefined,
      mistake: cleanOptional(rich.mistake) ?? "",
      lesson: cleanOptional(rich.lesson) ?? "",
      entryReason: cleanOptional(rich.entryReason) ?? "",
      exitReason: cleanOptional(rich.exitReason) ?? "",
      screenshots: (rich.screenshots ?? []).filter((item) => item.startsWith("data:image/")).slice(0, 3),
      voiceNote: cleanOptional(rich.voiceNote) ?? "",
      criteriaChecked: [...new Set((rich.criteriaChecked ?? []).map((item) => item.trim()).filter(Boolean))],
      mae: typeof rich.mae === "number" && Number.isFinite(rich.mae) ? rich.mae : null,
      mfe: typeof rich.mfe === "number" && Number.isFinite(rich.mfe) ? rich.mfe : null,
      source: rich.source ?? "manual",
      externalId: cleanOptional(rich.externalId) ?? "",
      createdAt: rich.createdAt,
      updatedAt: rich.updatedAt,
    };
  });

  const rules = uniqueById(data.rules)
    .map((rule) => ({ ...rule, text: rule.text.trim() }))
    .filter((rule) => rule.text.length > 0);
  const ruleIds = new Set(rules.map((rule) => rule.id));

  const checks = Object.fromEntries(
    Object.entries(data.checks)
      .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00`)))
      .map(([date, ids]) => [date, [...new Set(ids.filter((id) => ruleIds.has(id)))]]),
  );

  return {
    version: 3,
    startingBalance: data.startingBalance,
    trades,
    rules,
    checks,
    sampleBanner: data.sampleBanner,
    playbooks,
    activePlaybookId,
  };
}

export function serializeBackup(data: JournalBackup): string {
  return JSON.stringify(data, null, 2);
}

export function parseBackup(raw: string): { ok: true; data: JournalBackup } | { ok: false } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) return { ok: false };
  return { ok: true, data: normalizeBackup(parsed.data) };
}
