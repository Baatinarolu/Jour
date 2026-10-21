// Storage facade used by every server route.
//
// Driver priority:
//   1. Postgres  (Supabase / Neon / any POSTGRES_URL)  — durable
//   2. Redis     (Vercel KV / Upstash)                 — durable
//   3. Files     (server/.data locally, /tmp on Vercel) — ephemeral in production
//
// All drivers expose the same async API, so routes never care which one is live.

import type { JournalBackup } from "../../src/lib/journal/types.ts";
import * as fileStore from "./db-file.ts";
import type { JournalRecord, UserRecord } from "./db-file.ts";
import * as pgStore from "./postgres-store.ts";
import * as redisStore from "./redis-store.ts";

export type { JournalRecord, UserRecord } from "./db-file.ts";

export type StorageDriver =
  | "supabase-postgres"
  | "postgres"
  | "vercel-kv"
  | "upstash-redis"
  | "file:ephemeral"
  | "file:persistent";

export function getStorageDriver(): StorageDriver {
  if (pgStore.isPostgresConfigured()) return pgStore.isSupabase() ? "supabase-postgres" : "postgres";
  if (redisStore.isRedisConfigured()) return process.env.KV_REST_API_URL ? "vercel-kv" : "upstash-redis";
  if (process.env.VERCEL || process.env.NOW_BUILDER) return "file:ephemeral";
  return "file:persistent";
}

export function isPersistent(): boolean {
  const driver = getStorageDriver();
  return driver !== "file:ephemeral";
}

export function getStorageInfo(): string {
  const driver = getStorageDriver();
  switch (driver) {
    case "supabase-postgres":
      return "Supabase Postgres — accounts and journals are stored in your database and survive redeploys.";
    case "postgres":
      return "Postgres — accounts and journals are stored in your database and survive redeploys.";
    case "vercel-kv":
      return "Vercel KV / Redis — accounts and journals persist across deploys.";
    case "upstash-redis":
      return "Upstash Redis — accounts and journals persist across deploys.";
    case "file:ephemeral":
      return "Ephemeral /tmp — Vercel wipes it on redeploy and cold starts, so accounts are lost. Add a Postgres database (Supabase) or KV store to persist.";
    default:
      return "Local file (server/.data) — persists while this server runs locally.";
  }
}

/** Structured diagnostics for /api/health and the Settings panel. */
export async function storageDiagnostics() {
  const driver = getStorageDriver();
  const persistent = isPersistent();

  let probe: { ok: boolean; detail: string } = {
    ok: driver === "file:persistent",
    detail: driver === "file:persistent" ? "Local files are writable." : "No database configured — using filesystem.",
  };
  if (driver === "supabase-postgres" || driver === "postgres") probe = await pgStore.postgresSelfTest();
  else if (driver === "vercel-kv" || driver === "upstash-redis") probe = await redisStore.redisSelfTest();

  let accounts = 0;
  try {
    accounts = await listUsersCount();
  } catch {
    // diagnostics only
  }

  return {
    driver,
    persistent,
    detail: getStorageInfo(),
    probe,
    accounts,
  };
}

// ── Users ──

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const driver = getStorageDriver();
  if (driver === "supabase-postgres" || driver === "postgres") return pgStore.getUserByEmail(email);
  if (driver === "vercel-kv" || driver === "upstash-redis") return redisStore.getUserByEmail(email);
  return fileStore.getUserByEmail(email);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const driver = getStorageDriver();
  if (driver === "supabase-postgres" || driver === "postgres") return pgStore.getUserById(id);
  if (driver === "vercel-kv" || driver === "upstash-redis") return redisStore.getUserById(id);
  return fileStore.getUserById(id);
}

export async function createUser(email: string, passwordHash: string): Promise<UserRecord> {
  const driver = getStorageDriver();
  if (driver === "supabase-postgres" || driver === "postgres") return pgStore.createUser(email, passwordHash);
  if (driver === "vercel-kv" || driver === "upstash-redis") return redisStore.createUser(email, passwordHash);
  return fileStore.createUser(email, passwordHash);
}

export async function listUsersCount(): Promise<number> {
  const driver = getStorageDriver();
  if (driver === "supabase-postgres" || driver === "postgres") return pgStore.listUsersCount();
  if (driver === "vercel-kv" || driver === "upstash-redis") return redisStore.listUsersCount();
  return fileStore.listUsersCount();
}

// ── Journals ──

export async function getJournal(userId: string): Promise<JournalRecord | null> {
  const driver = getStorageDriver();
  if (driver === "supabase-postgres" || driver === "postgres") return pgStore.getJournal(userId);
  if (driver === "vercel-kv" || driver === "upstash-redis") return redisStore.getJournal(userId);
  return fileStore.getJournal(userId);
}

export async function saveJournal(
  userId: string,
  backup: JournalBackup,
  opts: { lastSyncedAt?: string | null; force?: boolean } = {},
): Promise<JournalRecord> {
  const driver = getStorageDriver();
  if (driver === "supabase-postgres" || driver === "postgres") return pgStore.saveJournal(userId, backup, opts);
  if (driver === "vercel-kv" || driver === "upstash-redis") return redisStore.saveJournal(userId, backup, opts);
  return fileStore.saveJournal(userId, backup, opts);
}

// Re-exported for tests and for drivers that share the merge implementation.
export { mergeBackups } from "./db-file.ts";
