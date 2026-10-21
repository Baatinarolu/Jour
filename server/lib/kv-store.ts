import type { JournalBackup } from "../../src/lib/journal/types.ts";
import { getChunkedJson, getJson, redisCommand, redisConfig, setChunkedJson, setJson } from "./redis.ts";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type JournalRecord = {
  userId: string;
  backup: JournalBackup;
  updatedAt: string;
  version: number;
};

// ── Keys ──
const USER_KEY = (id: string) => `santandc:user:${id}`;
const EMAIL_KEY = (email: string) => `santandc:email:${email}`;
const USERS_SET = "santandc:users";
const JOURNAL_KEY = (userId: string) => `santandc:journal:${userId}`;

function hasRedis(): boolean {
  return redisConfig() !== null;
}

// ── File fallback (imported lazily so the Redis path stays light) ──
let fileImpl: typeof import("./db-file.ts") | null = null;
async function getFileImpl() {
  if (fileImpl) return fileImpl;
  fileImpl = await import("./db-file.ts");
  return fileImpl;
}

// ── Diagnostics ──

export function getStorageDriver(): string {
  if (hasRedis()) {
    return process.env.KV_REST_API_URL ? "vercel-kv" : "upstash-redis";
  }
  if (process.env.VERCEL || process.env.NOW_BUILDER) return "file:ephemeral";
  return "file:persistent";
}

export function getStorageInfo(): string {
  const d = getStorageDriver();
  if (d === "vercel-kv") return "Vercel KV / Redis — accounts and journals persist across deploys.";
  if (d === "upstash-redis") return "Upstash Redis — accounts and journals persist across deploys.";
  if (d === "file:ephemeral") {
    return "Ephemeral /tmp — Vercel wipes it on redeploy and cold starts, so accounts are lost. Add a KV/Upstash Redis store to persist.";
  }
  return "Local file (server/.data) — persists while the server runs locally.";
}

export async function storageSelfTest(): Promise<{ ok: boolean; detail: string }> {
  if (!hasRedis()) return { ok: false, detail: "No Redis store configured — using filesystem." };
  try {
    const probe = `santandc:health:${Date.now()}`;
    await setJson(probe, { ok: true });
    const back = await getJson<{ ok?: boolean }>(probe);
    return back?.ok ? { ok: true, detail: "Redis read/write OK." } : { ok: false, detail: "Redis write succeeded but read-back was empty." };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// ── Users ──

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const key = email.trim().toLowerCase();
  const cfg = redisConfig();
  if (cfg) {
    try {
      const id = await getJson<string>(EMAIL_KEY(key));
      if (!id) return null;
      return await getJson<UserRecord>(USER_KEY(id));
    } catch (e) {
      console.warn("[storage] getUserByEmail failed, falling back to file", e);
    }
  }
  const file = await getFileImpl();
  return file.getUserByEmail(email);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const cfg = redisConfig();
  if (cfg) {
    try {
      return await getJson<UserRecord>(USER_KEY(id));
    } catch (e) {
      console.warn("[storage] getUserById failed", e);
    }
  }
  const file = await getFileImpl();
  return file.getUserById(id);
}

export async function createUser(email: string, passwordHash: string): Promise<UserRecord> {
  const normalized = email.trim().toLowerCase();
  const cfg = redisConfig();
  if (cfg) {
    // Reject only if a real account owns this email; a stale claim is reclaimed below.
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
  const file = await getFileImpl();
  return file.createUser(email, passwordHash);
}

export async function listUsersCount(): Promise<number> {
  const cfg = redisConfig();
  if (cfg) {
    try {
      const n = await redisCommand(cfg, ["SCARD", USERS_SET]);
      return typeof n === "number" ? n : Number(n ?? 0);
    } catch {
      return 0;
    }
  }
  const file = await getFileImpl();
  return file.listUsersCount();
}

// ── Journals ──

export async function getJournal(userId: string): Promise<JournalRecord | null> {
  const cfg = redisConfig();
  if (cfg) {
    try {
      return await getChunkedJson<JournalRecord>(JOURNAL_KEY(userId));
    } catch (e) {
      console.warn("[storage] getJournal failed", e);
    }
  }
  const file = await getFileImpl();
  return file.getJournal(userId);
}

export async function saveJournal(
  userId: string,
  backup: JournalBackup,
  opts: { lastSyncedAt?: string | null; force?: boolean } = {},
): Promise<JournalRecord> {
  const cfg = redisConfig();
  if (!cfg) {
    const file = await getFileImpl();
    return file.saveJournal(userId, backup, opts);
  }

  const existing = await getJournal(userId);
  const file = await getFileImpl();
  // One merge implementation for both backends — keeps file and Redis behaviour identical.
  const merged = existing ? file.mergeBackups(existing.backup, backup, { lastSyncedAt: opts.lastSyncedAt ?? null }) : backup;
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
