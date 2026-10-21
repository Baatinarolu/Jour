import { defineEventHandler, createError, getHeader, getMethod, readBody, setResponseHeader } from "h3";
import { parseBackup } from "../../src/lib/journal/backup.ts";
import { verifyToken, extractBearerToken } from "../lib/auth.ts";
import { getUserById, saveJournal, getJournal } from "../lib/db.ts";

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
  const lastSyncedAt = typeof body?.lastSyncedAt === "string" ? body.lastSyncedAt : null;
  const force = body?.force === true;

  const serialized = JSON.stringify(rawBackup);
  if (!serialized) throw createError({ statusCode: 400, statusMessage: "Invalid backup payload" });
  if (Buffer.byteLength(serialized, "utf8") > 10_000_000) {
    throw createError({ statusCode: 413, statusMessage: "Backup too large (max 10MB)" });
  }
  const parsed = parseBackup(serialized);
  if (!parsed.ok) {
    throw createError({ statusCode: 400, statusMessage: "Invalid backup payload" });
  }

  let record;
  try {
    record = await saveJournal(user.id, parsed.data, { lastSyncedAt, force });
  } catch (err) {
    console.error("[sync.put] save failed", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Could not save to cloud storage",
    });
  }
  const fresh = await getJournal(user.id);
  if (!fresh) throw createError({ statusCode: 500, statusMessage: "Failed to read back journal" });

  setResponseHeader(event, "Content-Type", "application/json");
  return { backup: fresh.backup, updatedAt: fresh.updatedAt, version: fresh.version, saved: record.updatedAt };
});
