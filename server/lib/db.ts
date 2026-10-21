import fs from "node:fs";
import path from "node:path";
import type { JournalBackup } from "../../src/lib/journal/types.ts";

// File driver for local dev + preview. On Vercel's read-only filesystem, /tmp is writable
// but ephemeral — for true persistence set DATABASE_URL (Postgres) or KV envs.

export type UserRecord = {
  id: string;
  email: string; // lowercased
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

const DATA_ROOT = (() => {
  // Prefer env override, then /tmp on Vercel (writable), else server/.data via cwd
  // Use cwd (repo root in dev/preview, /var/task on Lambda) — not fileURLToPath, which breaks after Nitro bundling
  if (process.env.SANTANDC_DATA_DIR) return process.env.SANTANDC_DATA_DIR;
  if (process.env.VERCEL || process.env.NOW_BUILDER) return "/tmp/santandc";
  return path.join(process.cwd(), "server", ".data");
})();

const USERS_FILE = path.join(DATA_ROOT, "users.json");
const JOURNALS_DIR = path.join(DATA_ROOT, "journals");

let usersCache: Record<string, UserRecord> | null = null;
const journalsCache: Map<string, JournalRecord> = new Map();

function ensureDirs() {
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.mkdirSync(JOURNALS_DIR, { recursive: true });
  } catch {
    // On some Vercel runtimes mkdir may fail silently — keep in-memory only.
  }
}

function loadUsers(): Record<string, UserRecord> {
  if (usersCache) return usersCache;
  ensureDirs();
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, "utf8");
      const parsed = JSON.parse(raw) as Record<string, UserRecord>;
      usersCache = parsed;
      return parsed;
    }
  } catch (e) {
    console.warn("[db] loadUsers failed, using memory", e);
  }
  usersCache = {};
  return usersCache;
}

function saveUsers(cache: Record<string, UserRecord>) {
  usersCache = cache;
  ensureDirs();
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // Ephemeral - keep in memory
  }
}

function journalPath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(JOURNALS_DIR, `${safe}.json`);
}

function loadJournalFromDisk(userId: string): JournalRecord | null {
  if (journalsCache.has(userId)) return journalsCache.get(userId)!;
  ensureDirs();
  try {
    const p = journalPath(userId);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(raw) as JournalRecord;
      journalsCache.set(userId, parsed);
      return parsed;
    }
  } catch (e) {
    console.warn("[db] loadJournal failed", e);
  }
  return null;
}

function saveJournalToDisk(record: JournalRecord) {
  journalsCache.set(record.userId, record);
  ensureDirs();
  try {
    fs.writeFileSync(journalPath(record.userId), JSON.stringify(record, null, 2), "utf8");
  } catch {
    // Keep in memory
  }
}

// --- Public API ---

export function getUserByEmail(email: string): UserRecord | null {
  const users = loadUsers();
  const key = email.trim().toLowerCase();
  return Object.values(users).find((u) => u.email === key) ?? null;
}

export function getUserById(id: string): UserRecord | null {
  const users = loadUsers();
  return users[id] ?? null;
}

export function createUser(email: string, passwordHash: string): UserRecord {
  const users = loadUsers();
  const normalized = email.trim().toLowerCase();
  if (Object.values(users).some((u) => u.email === normalized)) {
    throw new Error("Email already registered");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: UserRecord = { id, email: normalized, passwordHash, createdAt: now, updatedAt: now };
  users[id] = record;
  saveUsers(users);
  return record;
}

export function updateUser(id: string, patch: Partial<Pick<UserRecord, "passwordHash">>): UserRecord | null {
  const users = loadUsers();
  const existing = users[id];
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  users[id] = updated;
  saveUsers(users);
  return updated;
}

export function getJournal(userId: string): JournalRecord | null {
  return loadJournalFromDisk(userId);
}

export function saveJournal(userId: string, backup: JournalBackup, opts: { lastSyncedAt?: string | null; force?: boolean } = {}): JournalRecord {
  const now = new Date().toISOString();
  const existing = loadJournalFromDisk(userId);
  // Force replace (used for clear) — skip merge
  if (opts.force && !existing) {
    const record: JournalRecord = { userId, backup: { ...backup, updatedAt: backup.updatedAt ?? now }, updatedAt: now, version: 1 };
    saveJournalToDisk(record);
    return record;
  }
  if (opts.force && existing) {
    const record: JournalRecord = { userId, backup: { ...backup, updatedAt: backup.updatedAt ?? now }, updatedAt: now, version: existing.version + 1 };
    saveJournalToDisk(record);
    return record;
  }
  const merged = existing ? mergeBackups(existing.backup, backup, { lastSyncedAt: opts.lastSyncedAt ?? null }) : backup;
  const record: JournalRecord = {
    userId,
    backup: { ...merged, updatedAt: merged.updatedAt ?? backup.updatedAt ?? now },
    updatedAt: now,
    version: existing ? existing.version + 1 : 1,
  };
  saveJournalToDisk(record);
  return record;
}

export function listUsersCount(): number {
  return Object.keys(loadUsers()).length;
}

// --- Merge logic: entity-level LWW using updatedAt ---

function pickNewer<T extends { updatedAt?: string; createdAt?: string }>(a: T, b: T): T {
  const at = a.updatedAt || a.createdAt || "";
  const bt = b.updatedAt || b.createdAt || "";
  // Lexicographic ISO compare works for ISO strings; fallback to b if either missing
  if (!at) return b;
  if (!bt) return a;
  return bt >= at ? b : a;
}

function isDeleted(missingRemoteUpdatedAt: string, lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return false;
  return missingRemoteUpdatedAt <= lastSyncedAt;
}

function mergeBackups(existing: JournalBackup, incoming: JournalBackup, opts: { lastSyncedAt?: string | null } = {}): JournalBackup {
  const lastSyncedAt = opts.lastSyncedAt ?? null;
  // Trades by id
  const tradesMap = new Map<string, JournalBackup["trades"][number]>();
  for (const t of incoming.trades) tradesMap.set(t.id, t);
  for (const t of existing.trades) {
    const prev = tradesMap.get(t.id);
    if (!prev) {
      const remoteUpdated = t.updatedAt || t.createdAt || existing.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      tradesMap.set(t.id, t);
    } else tradesMap.set(t.id, pickNewer(prev, t) as typeof t);
  }

  // Playbooks by id
  const playbooksMap = new Map<string, JournalBackup["playbooks"][number]>();
  for (const p of incoming.playbooks) playbooksMap.set(p.id, p);
  for (const p of existing.playbooks) {
    const prev = playbooksMap.get(p.id);
    if (!prev) {
      const remoteUpdated = p.updatedAt || existing.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      playbooksMap.set(p.id, p);
    } else playbooksMap.set(p.id, pickNewer(prev, p) as typeof p);
  }

  // Day entries by date key
  const dayEntries: JournalBackup["dayEntries"] = { ...incoming.dayEntries };
  for (const [key, entry] of Object.entries(existing.dayEntries)) {
    const prev = dayEntries[key];
    if (!prev) {
      const remoteUpdated = entry.updatedAt || existing.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      dayEntries[key] = entry;
    } else dayEntries[key] = pickNewer(prev, entry);
  }

  // Weekly reviews by id
  const reviewsMap = new Map<string, JournalBackup["weeklyReviews"][number]>();
  for (const r of incoming.weeklyReviews) reviewsMap.set(r.id, r);
  for (const r of existing.weeklyReviews) {
    const prev = reviewsMap.get(r.id);
    if (!prev) {
      const remoteUpdated = r.updatedAt || existing.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      reviewsMap.set(r.id, r);
    } else reviewsMap.set(r.id, pickNewer(prev, r) as typeof r);
  }

  // Rules: union by id
  const rulesMap = new Map<string, JournalBackup["rules"][number]>();
  for (const r of incoming.rules) rulesMap.set(r.id, r);
  for (const r of existing.rules) {
    if (!rulesMap.has(r.id)) {
      const localUpdated = incoming.updatedAt || "";
      const remoteUpdated = existing.updatedAt || "";
      if (lastSyncedAt && incoming.trades.length === 0 && incoming.rules.length === 0 && localUpdated > (remoteUpdated || "")) continue;
      rulesMap.set(r.id, r);
    } else rulesMap.set(r.id, r);
  }

  // Checks: union per date
  const checks: JournalBackup["checks"] = { ...incoming.checks };
  for (const [date, ids] of Object.entries(existing.checks)) {
    const prev = checks[date] ?? [];
    checks[date] = [...new Set([...prev, ...ids])];
  }

  const incomingRecent = mostRecentTimestamp(incoming);
  const existingRecent = mostRecentTimestamp(existing);
  const incomingIsNewer = incomingRecent >= existingRecent;

  return {
    version: 4,
    startingBalance: incomingIsNewer ? incoming.startingBalance : existing.startingBalance,
    trades: [...tradesMap.values()].sort((a, b) => b.closedAt.localeCompare(a.closedAt)),
    rules: [...rulesMap.values()],
    checks,
    sampleBanner: false,
    playbooks: [...playbooksMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    activePlaybookId: incomingIsNewer ? incoming.activePlaybookId : existing.activePlaybookId ?? incoming.activePlaybookId,
    dayEntries,
    weeklyReviews: [...reviewsMap.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    updatedAt: incoming.updatedAt && existing.updatedAt ? (incoming.updatedAt >= existing.updatedAt ? incoming.updatedAt : existing.updatedAt) : incoming.updatedAt ?? existing.updatedAt ?? new Date().toISOString(),
  };
}

function mostRecentTimestamp(backup: JournalBackup): string {
  let max = "";
  for (const t of backup.trades) {
    const ts = t.updatedAt || t.createdAt || t.closedAt;
    if (ts > max) max = ts;
  }
  for (const r of backup.weeklyReviews) if (r.updatedAt > max) max = r.updatedAt;
  for (const k of Object.keys(backup.dayEntries)) {
    const d = backup.dayEntries[k];
    if (d && d.updatedAt > max) max = d.updatedAt;
  }
  return max || new Date(0).toISOString();
}
