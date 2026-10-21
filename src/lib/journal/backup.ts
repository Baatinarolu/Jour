import { z } from "zod";
import { GRADES, MARKETS, SESSIONS, SIDES, type JournalBackup } from "./types";

const tradeSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  market: z.enum(MARKETS),
  side: z.enum(SIDES),
  openedAt: z.string().min(1),
  closedAt: z.string().min(1),
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
});

const backupSchema = z.object({
  version: z.literal(1),
  startingBalance: z.number().nonnegative().finite(),
  trades: z.array(tradeSchema),
  rules: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
  checks: z.record(z.string(), z.array(z.string())),
  sampleBanner: z.boolean(),
});

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
  return { ok: true, data: parsed.data };
}
