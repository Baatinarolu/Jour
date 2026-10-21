// Postgres driver tests. They run against a real database when TEST_POSTGRES_URL
// is set (locally: any Postgres on 127.0.0.1) and are skipped otherwise so the
// suite stays green without one.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createNeonQueryFn, detectPostgresProvider, postgresUrl } from "./postgres-store.ts";

const url = process.env.TEST_POSTGRES_URL ?? "";
const enabled = url.length > 0;
const database = test;
const skip = (name: string) => test(name, { skip: "TEST_POSTGRES_URL not set" }, () => {});

let store: typeof import("./postgres-store.ts");
type PgModule = typeof import("pg");
let pg: PgModule | null = null;
const userIds: string[] = [];

before(async () => {
  if (!enabled) return;
  process.env.POSTGRES_URL = url;
  // Start from a clean schema so CREATE TABLE / upsert paths are exercised.
  const pgModule = await import("pg");
  pg = pgModule;
  const pool = new pgModule.Pool({ connectionString: url });
  await pool.query("DROP TABLE IF EXISTS santandc_journals");
  await pool.query("DROP TABLE IF EXISTS santandc_users");
  await pool.end();

  store = await import("./postgres-store.ts");
  store.resetSchemaCache();
});

after(async () => {
  if (!enabled || !pg) return;
  const pool = new pg.Pool({ connectionString: url });
  for (const id of userIds) await pool.query("DELETE FROM santandc_journals WHERE user_id = $1", [id]);
  await pool.query("DELETE FROM santandc_users WHERE email LIKE 'storetest+%'");
  await pool.end();
});

function makeBackup(tradeCount: number, note = "x") {
  return {
    version: 4 as const,
    startingBalance: 25_000,
    trades: Array.from({ length: tradeCount }, (_, i) => ({
      id: `t${i}`,
      symbol: "AAPL",
      market: "stocks" as const,
      side: "long" as const,
      openedAt: "2026-01-01T00:00:00.000Z",
      closedAt: "2026-01-01T01:00:00.000Z",
      entry: 100,
      exit: 110,
      quantity: 1,
      multiplier: 1,
      stop: null,
      fees: 0,
      setup: note,
      session: "newyork" as const,
      grade: "A" as const,
      followedPlan: true,
      notes: "",
      tags: [],
      account: "Main",
      playbookId: null,
      target: null,
      timeframe: "5m",
      tvSymbol: "NASDAQ:AAPL",
      confidence: 3,
      mistake: "",
      lesson: "",
      entryReason: "",
      exitReason: "",
      screenshots: [],
      voiceNote: "",
      criteriaChecked: [],
      mae: null,
      mfe: null,
      source: "manual" as const,
      externalId: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    rules: [],
    checks: {},
    sampleBanner: false,
    playbooks: [],
    activePlaybookId: null,
    dayEntries: {},
    weeklyReviews: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

database("postgres store: schema is created on first use", { skip: !enabled }, async () => {
  const result = await store.postgresSelfTest();
  assert.equal(result.ok, true, result.detail);
});

database("postgres store: accounts round-trip", { skip: !enabled }, async () => {
  const email = `storetest+${Date.now()}@example.com`;
  const created = await store.createUser(email, "bcrypt-hash");
  userIds.push(created.id);

  const byEmail = await store.getUserByEmail(email.toUpperCase());
  assert.equal(byEmail?.id, created.id);
  assert.equal(byEmail?.email, email.toLowerCase());

  const byId = await store.getUserById(created.id);
  assert.equal(byId?.email, email.toLowerCase());

  await assert.rejects(() => store.createUser(email, "another-hash"), /already registered/i);
  assert.ok((await store.listUsersCount()) >= 1);
});

database("postgres store: journal saves, merges by updatedAt, and reloads", { skip: !enabled }, async () => {
  const user = await store.createUser(`storetest+journal-${Date.now()}@example.com`, "hash");
  userIds.push(user.id);

  const first = await store.saveJournal(user.id, makeBackup(2));
  assert.equal(first.version, 1);

  // A newer edit to t0 wins while the untouched t1 survives.
  const second = makeBackup(2);
  second.trades[0] = { ...second.trades[0], setup: "newer", updatedAt: "2026-02-01T00:00:00.000Z" };
  const merged = await store.saveJournal(user.id, second);
  const setups = merged.backup.trades.map((t) => t.setup).sort();
  assert.deepEqual(setups, ["newer", "x"]);

  // A trade that exists only in the cloud is not lost by a stale push.
  const stalePush = { ...makeBackup(1), updatedAt: "2026-03-01T00:00:00.000Z" };
  const union = await store.saveJournal(user.id, stalePush);
  assert.equal(union.backup.trades.length, 2, "remote-only trade must survive");

  const reloaded = await store.getJournal(user.id);
  assert.equal(reloaded?.backup.trades.length, 2);
  assert.equal(reloaded?.backup.trades.find((t) => t.id === "t0")?.setup, "newer");
});

database("postgres store: large journals survive jsonb round-trip", { skip: !enabled }, async () => {
  const user = await store.createUser(`storetest+large-${Date.now()}@example.com`, "hash");
  userIds.push(user.id);

  const big = makeBackup(6, "y".repeat(150_000)); // ~900 KB
  await store.saveJournal(user.id, big);
  const reloaded = await store.getJournal(user.id);
  assert.equal(reloaded?.backup.trades.length, 6);
  assert.equal(reloaded?.backup.trades[0].setup.length, 150_000);
});

database("postgres store: deletion semantics match the other drivers", { skip: !enabled }, async () => {
  const user = await store.createUser(`storetest+delete-${Date.now()}@example.com`, "hash");
  userIds.push(user.id);
  await store.saveJournal(user.id, makeBackup(3));

  // Cleared locally after a sync → the 3 cloud trades are removed.
  const lastSyncedAt = "2026-01-01T00:00:00.000Z";
  await store.saveJournal(user.id, { ...makeBackup(0), updatedAt: "2026-01-02T00:00:00.000Z" }, { lastSyncedAt });
  assert.equal((await store.getJournal(user.id))?.backup.trades.length, 0);

  // A brand-new device (no lastSyncedAt) must not wipe the cloud.
  const other = await store.createUser(`storetest+newdevice-${Date.now()}@example.com`, "hash");
  userIds.push(other.id);
  await store.saveJournal(other.id, makeBackup(2));
  await store.saveJournal(other.id, { ...makeBackup(0), updatedAt: "2026-01-02T00:00:00.000Z" });
  assert.equal((await store.getJournal(other.id))?.backup.trades.length, 2);
});

database("postgres store: force push replaces", { skip: !enabled }, async () => {
  const user = await store.createUser(`storetest+force-${Date.now()}@example.com`, "hash");
  userIds.push(user.id);
  await store.saveJournal(user.id, makeBackup(4));
  await store.saveJournal(user.id, makeBackup(0), { force: true });
  assert.equal((await store.getJournal(user.id))?.backup.trades.length, 0);
});

skip("postgres store: skipped without TEST_POSTGRES_URL");

// ── Neon selection unit tests (no database needed) ──

test("detectPostgresProvider identifies Neon, Supabase and generic hosts", () => {
  assert.equal(
    detectPostgresProvider("postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/neondb?sslmode=require"),
    "neon",
  );
  assert.equal(
    detectPostgresProvider("postgresql://u:p@ep-cool-123-pooler.c-2.us-east-2.aws.neon.tech/neondb"),
    "neon",
  );
  assert.equal(
    detectPostgresProvider("postgresql://postgres.x:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"),
    "supabase",
  );
  assert.equal(detectPostgresProvider("postgresql://u:p@db.example.com:5432/app"), "generic");
  assert.equal(detectPostgresProvider("postgresql://u:p@127.0.0.1:5432/app"), "generic");
  // A database *named* neondb on someone else's host is not Neon.
  assert.equal(detectPostgresProvider("postgresql://u:p@db.example.com/neondb"), "generic");
});

test("postgresUrl prefers a Neon URL when several variables are set", () => {
  const keys = ["POSTGRES_URL", "DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    assert.equal(postgresUrl(), null);

    process.env.POSTGRES_URL = "postgresql://postgres.x:p@aws-0.pooler.supabase.com:6543/postgres";
    assert.equal(postgresUrl(), process.env.POSTGRES_URL);

    // Attaching Neon (DATABASE_URL) wins over a stale Supabase POSTGRES_URL.
    process.env.DATABASE_URL = "postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
    assert.equal(postgresUrl(), process.env.DATABASE_URL);

    // Copy/paste artifacts are cleaned up.
    process.env.DATABASE_URL = " postgresql://u:p@ep-x.us-east-2.aws.neon.tech/neondb?sslmode=require&amp;channel_binding=require ";
    assert.equal(postgresUrl(), "postgresql://u:p@ep-x.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require");
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test("createNeonQueryFn forwards text/params and returns rows", async () => {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const run = createNeonQueryFn({
    query: async (text, params) => {
      calls.push([text, params]);
      return { rows: [{ id: "u1", backup: { version: 4 } }] };
    },
  });
  const { rows } = await run("SELECT * FROM santandc_journals WHERE user_id = $1", ["u1"]);
  assert.deepEqual(rows, [{ id: "u1", backup: { version: 4 } }]);
  assert.deepEqual(calls, [["SELECT * FROM santandc_journals WHERE user_id = $1", ["u1"]]]);
});
