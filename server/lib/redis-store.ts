// Redis driver (Vercel KV / Upstash). Optional: Postgres takes priority when
// configured. Kept dependency-free by talking to the REST API directly.

import type { JournalBackup } from "../../src/lib/journal/types.ts";
import { mergeBackups } from "./db-file.ts";
import type { JournalRecord, UserRecord } from "./db-file.ts";
import { delKey, getChunkedJson, getJson, redisCommand, redisConfig, setChunkedJson, setJson } from "./redis.ts";

const USER_KEY = (id: string) => `santandc:user:${id}`;
const EMAIL_KEY = (email: string) => `santandc:email:${email}`;
const USERS_SET = "santandc:users";
const JOURNAL_KEY = (userId: string) => `santandc:journal:${userId}`;

export function isRedisConfigured(): boolean {
  return redisConfig() !== null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  const id = await getJson<string>(EMAIL_KEY(email.trim().toLowerCase()));
  if (!id) return null;
  return getJson<UserRecord>(USER_KEY(id));
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  return getJson<UserRecord>(USER_KEY(id));
}

export async function createUser(email: string, passwordHash: string): Promise<UserRecord> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  const normalized = email.trim().toLowerCase();

  // Only reject when a real account owns the email; a stale claim can be replaced.
  const existingId = await getJson<string>(EMAIL_KEY(normalized));
  if (existingId) {
    const existingUser = await getJson<UserRecord>(USER_KEY(existingId));
    if (existingUser) throw new Error("Email already registered");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: UserRecord = { id, email: normalized, passwordHash, createdAt: now, updatedAt: now };
  await setJson(USER_KEY(id), record);
  await setJson(EMAIL_KEY(normalized), id);
  await Promise.all([
    redisCommand(cfg, ["SADD", USERS_SET, id]),
    redisCommand(cfg, ["SADD", "santandc:emails", normalized]),
  ]);
  return record;
}

export async function listUsersCount(): Promise<number> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  const n = await redisCommand(cfg, ["SCARD", USERS_SET]);
  return typeof n === "number" ? n : Number(n ?? 0);
}

export async function getJournal(userId: string): Promise<JournalRecord | null> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  return getChunkedJson<JournalRecord>(JOURNAL_KEY(userId));
}

export async function saveJournal(
  userId: string,
  backup: JournalBackup,
  opts: { lastSyncedAt?: string | null; force?: boolean } = {},
): Promise<JournalRecord> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");

  const existing = await getJournal(userId);
  const merged = existing
    ? mergeBackups(existing.backup, backup, { lastSyncedAt: opts.lastSyncedAt ?? null })
    : backup;
  const finalBackup = opts.force ? backup : merged;
  const now = new Date().toISOString();
  const record: JournalRecord = {
    userId,
    backup: { ...finalBackup, updatedAt: finalBackup.updatedAt ?? backup.updatedAt ?? now },
    updatedAt: now,
    version: existing ? existing.version + 1 : 1,
  };
  await setChunkedJson(JOURNAL_KEY(userId), record);
  return record;
}

const AUTH_SECRET_KEY = "santandc:meta:auth_secret";

/**
 * Return the stored managed auth secret, atomically storing `candidate`
 * if none exists yet (SET NX). Concurrent first boots converge on one value.
 */
export async function getOrCreateManagedAuthSecret(candidate: string): Promise<string> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  const won = await redisCommand(cfg, ["SET", AUTH_SECRET_KEY, candidate, "NX"]);
  if (won === "OK") return candidate;
  const existing = await redisCommand(cfg, ["GET", AUTH_SECRET_KEY]);
  if (typeof existing !== "string" || !existing) throw new Error("Managed auth secret could not be stored");
  return existing;
}

export async function redisSelfTest(): Promise<{ ok: boolean; detail: string }> {
  if (!isRedisConfigured()) return { ok: false, detail: "No Redis store configured." };
  try {
    const probe = `santandc:health:${Date.now()}`;
    await setJson(probe, { ok: true });
    const back = await getJson<{ ok?: boolean }>(probe);
    await delKey(probe);
    return back?.ok
      ? { ok: true, detail: "Redis read/write OK." }
      : { ok: false, detail: "Redis write succeeded but read-back was empty." };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
