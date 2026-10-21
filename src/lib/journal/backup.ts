import { z } from "zod";
import { GRADES, MARKETS, SESSIONS, SIDES, type JournalBackup, type Trade } from "./types.ts";

const dateString = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const tradeFields = {
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

function requireOrderedDates<T extends { openedAt: string; closedAt: string }>(trade: T, ctx: z.RefinementCtx) {
  if (Date.parse(trade.closedAt) < Date.parse(trade.openedAt)) {
    ctx.addIssue({ code: "custom", message: "Trade closes before it opens", path: ["closedAt"] });
  }
}

const tradeSchemaV1 = z.object(tradeFields).superRefine(requireOrderedDates);
const tradeSchemaV2 = z
  .object({ ...tradeFields, multiplier: z.number().positive().finite() })
  .superRefine(requireOrderedDates);

const ruleSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });
const checksSchema = z.record(z.string(), z.array(z.string()));

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
]);

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function normalizeBackup(data: z.infer<typeof backupSchema>): JournalBackup {
  const trades: Trade[] = uniqueById(data.trades).map((trade) => ({
    ...trade,
    symbol: trade.symbol.trim().toUpperCase(),
    multiplier:
      "multiplier" in trade && typeof trade.multiplier === "number" && trade.multiplier > 0
        ? trade.multiplier
        : 1,
    setup: trade.setup.trim(),
    notes: trade.notes.trim(),
    tags: [...new Set(trade.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 6),
  }));

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
    version: 2,
    startingBalance: data.startingBalance,
    trades,
    rules,
    checks,
    sampleBanner: data.sampleBanner,
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
