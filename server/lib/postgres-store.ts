// Postgres driver (Supabase / Neon / any Postgres).
//
// The journal is stored as one JSONB document per user plus a users table, so the
// schema stays tiny and the merge semantics match the other drivers exactly.
//
// Works with Vercel's Supabase integration, which injects POSTGRES_URL /
// POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING without any extra setup.

import type { JournalBackup } from "../../src/lib/journal/types.ts";
import { mergeBackups } from "./db-file.ts";
import type { JournalRecord, UserRecord } from "./db-file.ts";

export type QueryResult = { rows: Record<string, unknown>[] };
export type QueryFn = (sql: string, params: unknown[]) => Promise<QueryResult>;

const CONNECTION_ENV_VARS = [
  "POSTGRES_URL",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

/** Connection string, or null when Postgres is not configured. */
export function postgresUrl(): string | null {
  for (const key of CONNECTION_ENV_VARS) {
    const value = process.env[key];
    if (value && value.trim()) {
      // Copy/paste artifacts ("&amp;") and stray whitespace break DNS lookups.
      return value.trim().replace(/&amp;/g, "&");
    }
  }
  return null;
}

export function isPostgresConfigured(): boolean {
  return postgresUrl() !== null;
}

export function isSupabase(): boolean {
  const url = postgresUrl() ?? "";
  return /supabase\.(co|com|net)/i.test(url) || !!process.env.SUPABASE_URL;
}

function isLocalConnection(url: string): boolean {
  return /@?(localhost|127\.0\.0\.1|host=\/)/.test(url) || /^postgres(ql)?:\/\/[^@]*@?\//.test(url);
}

// ── Pool ──

type PoolLike = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
let pool: PoolLike | null = null;
let poolUrl: string | null = null;

async function getPool(): Promise<PoolLike> {
  const url = postgresUrl();
  if (!url) throw new Error("Postgres is not configured (no POSTGRES_URL/DATABASE_URL)");
  if (pool && poolUrl === url) return pool;

  const { Pool } = await import("pg");
  const explicitSsl = /[?&]sslmode=/.test(url);
  const config: Record<string, unknown> = {
    connectionString: url,
    // Serverless: a few connections per instance is plenty, and short idle
    // timeouts keep PgBouncer's connection budget healthy.
    max: Number(process.env.PG_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  };
  // Managed providers (Supabase pooler, Neon) require TLS. When the URL does not
  // say so explicitly, opt in for non-local hosts.
  if (!explicitSsl && !isLocalConnection(url)) config.ssl = { rejectUnauthorized: false };
  // Escape hatch for self-signed / private-CA hosts. Verification stays on by default.
  if (process.env.PG_SSL_NO_VERIFY === "1" && !isLocalConnection(url)) {
    config.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(config) as unknown as PoolLike;
  poolUrl = url;
  return pool;
}

const query: QueryFn = async (sql, params) => {
  const client = await getPool();
  const result = await client.query(sql, params);
  return { rows: result.rows };
};

// ── Schema ──

let schemaReady: Promise<void> | null = null;

export function resetSchemaCache() {
  schemaReady = null;
}

async function ensureSchema(run: QueryFn): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await run(
        `CREATE TABLE IF NOT EXISTS santandc_users (
           id text PRIMARY KEY,
           email text UNIQUE NOT NULL,
           password_hash text NOT NULL,
           created_at text NOT NULL,
           updated_at text NOT NULL
         )`,
        [],
      );
      await run(
        `CREATE TABLE IF NOT EXISTS santandc_journals (
           user_id text PRIMARY KEY,
           backup jsonb NOT NULL,
           version integer NOT NULL,
           updated_at text NOT NULL
         )`,
        [],
      );
      await run(`CREATE INDEX IF NOT EXISTS santandc_journals_updated_idx ON santandc_journals (updated_at)`, []);
    })().catch((err) => {
      // Let the next request retry instead of caching a failure forever.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// ── Store factory (exported so tests can run against a real database) ──

export function createPostgresStore(run: QueryFn) {
  const ready = () => ensureSchema(run);

  async function getJournal(userId: string): Promise<JournalRecord | null> {
    await ready();
    const { rows } = await run(
      `SELECT user_id, backup, version, updated_at FROM santandc_journals WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      userId: String(row.user_id),
      backup: row.backup as JournalBackup,
      version: Number(row.version),
      updatedAt: String(row.updated_at),
    };
  }

  async function saveJournal(
    userId: string,
    backup: JournalBackup,
    opts: { lastSyncedAt?: string | null; force?: boolean } = {},
  ): Promise<JournalRecord> {
    await ready();
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
    const { rows } = await run(
      `INSERT INTO santandc_journals (user_id, backup, version, updated_at)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET backup = EXCLUDED.backup,
             version = EXCLUDED.version,
             updated_at = EXCLUDED.updated_at
       RETURNING user_id, backup, version, updated_at`,
      [userId, JSON.stringify(record.backup), record.version, record.updatedAt],
    );
    const row = rows[0];
    if (!row) return record;
    return {
      userId: String(row.user_id),
      backup: row.backup as JournalBackup,
      version: Number(row.version),
      updatedAt: String(row.updated_at),
    };
  }

  return {
    async getUserByEmail(email: string): Promise<UserRecord | null> {
      await ready();
      const { rows } = await run(
        `SELECT id, email, password_hash, created_at, updated_at FROM santandc_users WHERE email = $1 LIMIT 1`,
        [email.trim().toLowerCase()],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async getUserById(id: string): Promise<UserRecord | null> {
      await ready();
      const { rows } = await run(
        `SELECT id, email, password_hash, created_at, updated_at FROM santandc_users WHERE id = $1 LIMIT 1`,
        [id],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async createUser(email: string, passwordHash: string): Promise<UserRecord> {
      await ready();
      const normalized = email.trim().toLowerCase();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const { rows } = await run(
        `INSERT INTO santandc_users (id, email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, password_hash, created_at, updated_at`,
        [id, normalized, passwordHash, now],
      );
      if (!rows[0]) throw new Error("Email already registered");
      return toUser(rows[0]);
    },

    async listUsersCount(): Promise<number> {
      await ready();
      const { rows } = await run(`SELECT count(*)::int AS count FROM santandc_users`, []);
      return Number(rows[0]?.count ?? 0);
    },

    getJournal,
    saveJournal,
  };
}

function toUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// ── Default instance bound to the app's pool ──

const store = createPostgresStore(query);

export const getUserByEmail = store.getUserByEmail;
export const getUserById = store.getUserById;
export const createUser = store.createUser;
export const listUsersCount = store.listUsersCount;
export const getJournal = store.getJournal;
export const saveJournal = store.saveJournal;

/** Round-trip check used by /api/health. */
export async function postgresSelfTest(): Promise<{ ok: boolean; detail: string }> {
  if (!isPostgresConfigured()) return { ok: false, detail: "No Postgres connection string configured." };
  try {
    const url = postgresUrl();
    const target = url ? redactConnectionString(url) : "unknown";
    const { rows } = await query(`SELECT 1 AS ok`, []);
    if (!rows[0]) return { ok: false, detail: `Connected to ${target} but the probe returned no rows.` };
    await ensureSchema(query);
    return { ok: true, detail: `Connected to ${target}; tables ready.` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export function redactConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    const user = parsed.username || "postgres";
    const host = parsed.hostname || "local";
    const port = parsed.port ? `:${parsed.port}` : "";
    const db = parsed.pathname.replace(/^\//, "") || "postgres";
    return `${parsed.protocol}//${user}@${host}${port}/${db}`;
  } catch {
    return "postgres://***";
  }
}
