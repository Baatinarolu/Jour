// Verifies the Redis-backed storage path against a tiny in-memory
// Upstash-REST-compatible server, including chunked journal writes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Minimal Upstash REST emulation: /COMMAND/arg1/arg2...
type Store = {
  strings: Map<string, string>;
  sets: Map<string, Set<string>>;
};

function createServer(store: Store) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (result: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result }));
    };

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "POST required" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      runCommand(body);
    });

    function runCommand(rawBody: string) {
      if (req.headers.authorization !== "Bearer test-token") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      let parts: string[];
      try {
        parts = JSON.parse(rawBody) as string[];
      } catch {
        const pathParts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        parts = pathParts;
      }
      const [cmd, ...args] = parts;
    switch ((cmd ?? "").toUpperCase()) {
      case "GET":
        send(store.strings.get(args[0]) ?? null);
        return;
      case "SET": {
        const [key, value, flag] = args;
        if (flag === "NX" && store.strings.has(key)) return send(null);
        store.strings.set(key, value);
        send("OK");
        return;
      }
      case "DEL": {
        const existed = store.strings.delete(args[0]);
        send(existed ? 1 : 0);
        return;
      }
      case "SADD": {
        const set = store.sets.get(args[0]) ?? new Set<string>();
        const before = set.size;
        set.add(args[1]);
        store.sets.set(args[0], set);
        send(set.size - before);
        return;
      }
      case "SCARD":
        send(store.sets.get(args[0])?.size ?? 0);
        return;
      default:
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `unknown command ${cmd}` }));
      }
    }
  });
}

const store: Store = { strings: new Map(), sets: new Map() };
let server: http.Server;
let storage: typeof import("./kv-store.ts");

before(async () => {
  server = createServer(store);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.KV_REST_API_URL = `http://127.0.0.1:${port}`;
  process.env.KV_REST_API_TOKEN = "test-token";
  storage = await import("./kv-store.ts");
});

after(() => {
  server.close();
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

test("redis driver is detected", () => {
  assert.equal(storage.getStorageDriver(), "vercel-kv");
  assert.match(storage.getStorageInfo(), /persist/i);
});

test("health self-test passes against the emulated store", async () => {
  const result = await storage.storageSelfTest();
  assert.equal(result.ok, true, result.detail);
});

test("accounts survive a simulated cold start", async () => {
  const user = await storage.createUser("rider@example.com", "hash");
  assert.equal(user.email, "rider@example.com");

  // Simulated cold start: drop the module cache, re-import, read again.
  const fresh = await import(`./kv-store.ts?fresh=${Date.now()}`);
  const found = await fresh.getUserByEmail("RIDER@example.com");
  assert.equal(found?.id, user.id);
  assert.equal(await fresh.listUsersCount(), 1);
});

test("duplicate email is rejected", async () => {
  await assert.rejects(() => storage.createUser("rider@example.com", "hash"), /already registered/i);
});

test("journal survives a round trip, including chunked payloads", async () => {
  const user = await storage.createUser("big@example.com", "hash");
  // ~900 KB of trade notes forces multiple 400 KB chunks.
  const backup = makeBackup(6, "y".repeat(150_000));
  const saved = await storage.saveJournal(user.id, backup);
  assert.equal(saved.version, 1);

  const reloaded = await storage.getJournal(user.id);
  assert.equal(reloaded?.backup.trades.length, 6);
  assert.equal(reloaded?.backup.trades[0].setup.length, 150_000);
});

test("deletions still win through the redis path", async () => {
  const user = await storage.createUser("delete@example.com", "hash");
  const first = makeBackup(2);
  await storage.saveJournal(user.id, first);

  // Clear locally after a sync: remote entities existed at lastSyncedAt, so drop them.
  const lastSyncedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();
  const empty = { ...makeBackup(0), updatedAt: "2026-01-02T00:00:00.000Z" };
  await storage.saveJournal(user.id, empty, { lastSyncedAt });
  const after = await storage.getJournal(user.id);
  assert.equal(after?.backup.trades.length, 0);

  // A brand-new device (no lastSyncedAt) must NOT wipe the cloud.
  const other = await storage.createUser("newdevice@example.com", "hash");
  await storage.saveJournal(other.id, makeBackup(3));
  const blank = { ...makeBackup(0), updatedAt: "2026-01-02T00:00:00.000Z" };
  await storage.saveJournal(other.id, blank);
  const preserved = await storage.getJournal(other.id);
  assert.equal(preserved?.backup.trades.length, 3);
});

test("force push replaces instead of merging", async () => {
  const user = await storage.createUser("force@example.com", "hash");
  await storage.saveJournal(user.id, makeBackup(4));
  await storage.saveJournal(user.id, makeBackup(0), { force: true });
  const after = await storage.getJournal(user.id);
  assert.equal(after?.backup.trades.length, 0);
});
