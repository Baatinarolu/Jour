import { defineEventHandler, createError, getHeader, getMethod, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { verifyToken, extractBearerToken } from "../lib/auth.ts";
import { getUserById, saveJournal, getJournal } from "../lib/db.ts";

// Reuse backup validation from src, but keep server-side light
const tradeSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  market: z.enum(["stocks", "options", "futures", "forex", "crypto", "indices", "commodities", "metals"]),
  side: z.enum(["long", "short"]),
  openedAt: z.string().min(1),
  closedAt: z.string().min(1),
  entry: z.number().finite(),
  exit: z.number().finite(),
  quantity: z.number().positive().finite(),
  multiplier: z.number().positive().finite(),
  stop: z.number().finite().nullable(),
  fees: z.number().nonnegative().finite(),
  setup: z.string(),
  session: z.enum(["asia", "london", "overlap", "newyork", "other"]),
  grade: z.enum(["A+", "A", "B", "C", "D", "F"]),
  followedPlan: z.boolean(),
  notes: z.string(),
  tags: z.array(z.string()),
}).passthrough();

const backupSchema = z.object({
  version: z.literal(4),
  startingBalance: z.number().finite(),
  trades: z.array(tradeSchema),
  rules: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
  checks: z.record(z.string(), z.array(z.string())),
  sampleBanner: z.boolean(),
  playbooks: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }).passthrough()),
  activePlaybookId: z.string().nullable(),
  dayEntries: z.record(z.string(), z.object({ date: z.string() }).passthrough()),
  weeklyReviews: z.array(z.object({ id: z.string().min(1), weekStart: z.string(), weekEnd: z.string() }).passthrough()),
  updatedAt: z.string().optional(),
}).passthrough();

export default defineEventHandler(async (event) => {
  if (getMethod(event) !== "PUT" && getMethod(event) !== "POST") {
    throw createError({ statusCode: 405, statusMessage: "Method not allowed" });
  }

  const auth = getHeader(event, "authorization");
  const token = extractBearerToken(auth);
  if (!token) throw createError({ statusCode: 401, statusMessage: "Missing token" });

  const payload = await verifyToken(token);
  if (!payload) throw createError({ statusCode: 401, statusMessage: "Invalid token" });

  const user = await getUserById(payload.sub);
  if (!user) throw createError({ statusCode: 401, statusMessage: "User not found" });

  const body = await readBody(event) as { backup?: unknown; lastSyncedAt?: string | null; force?: boolean } & Record<string, unknown>;
  // Body may be { backup: {...}, lastSyncedAt, force } or raw backup
  const rawBackup = (body as { backup?: unknown })?.backup ?? body;
  const lastSyncedAt = typeof body.lastSyncedAt === "string" ? body.lastSyncedAt : null;
  const force = body.force === true;

  const parsed = backupSchema.safeParse(rawBackup);
  if (!parsed.success) {
    console.warn("[sync.put] validation failed", parsed.error.flatten());
    throw createError({ statusCode: 400, statusMessage: "Invalid backup payload" });
  }

  // Size guard: screenshots are data URLs, can blow up
  const jsonSize = JSON.stringify(parsed.data).length;
  if (jsonSize > 10_000_000) {
    throw createError({ statusCode: 413, statusMessage: "Backup too large (max 10MB). Remove screenshots or split." });
  }

  let record;
  try {
    record = await saveJournal(user.id, parsed.data as unknown as import("../../src/lib/journal/types.ts").JournalBackup, { lastSyncedAt, force });
  } catch (err) {
    console.error("[sync.put] save failed", err);
    throw createError({
      statusCode: 500,
      statusMessage: `Could not save to cloud storage: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  const fresh = await getJournal(user.id);
  if (!fresh) throw createError({ statusCode: 500, statusMessage: "Failed to read back journal" });

  setResponseHeader(event, "Content-Type", "application/json");
  return { backup: fresh.backup, updatedAt: fresh.updatedAt, version: fresh.version, saved: record.updatedAt };
});
