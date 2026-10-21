import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { JournalBackup } from "./types.ts";
import { useJournal } from "./store.ts";
import { parseBackup } from "./backup.ts";

const TOKEN_KEY = "santandc-auth-token";
const USER_KEY = "santandc-auth-user";
const LAST_SYNC_KEY = "santandc-last-sync";

export type SyncUser = { id: string; email: string; createdAt?: string };

type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

type SyncState = {
  user: SyncUser | null;
  token: string | null;
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  autoSync: boolean;
  setUser: (user: SyncUser | null, token: string | null) => void;
  setStatus: (status: SyncStatus, error?: string | null) => void;
  setLastSyncedAt: (iso: string | null) => void;
  setAutoSync: (value: boolean) => void;
  logout: () => void;
};

export const useSync = create<SyncState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      status: "idle",
      lastSyncedAt: null,
      error: null,
      autoSync: true,
      setUser: (user, token) => {
        const previous = useSync.getState().user;
        // A different account must not inherit the old account's sync checkpoint,
        // otherwise "deleted" entities from the previous account could be dropped.
        const accountChanged = !!user && !!previous && previous.id !== user.id;
        if (typeof window !== "undefined") {
          if (token) localStorage.setItem(TOKEN_KEY, token);
          else localStorage.removeItem(TOKEN_KEY);
          if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
          else localStorage.removeItem(USER_KEY);
          if (accountChanged) localStorage.removeItem(LAST_SYNC_KEY);
        }
        set({
          user,
          token,
          error: null,
          status: user ? "idle" : "idle",
          ...(accountChanged ? { lastSyncedAt: null } : {}),
        });
      },
      setStatus: (status, error = null) => set({ status, error }),
      setLastSyncedAt: (iso) => {
        if (typeof window !== "undefined") {
          if (iso) localStorage.setItem(LAST_SYNC_KEY, iso);
          else localStorage.removeItem(LAST_SYNC_KEY);
        }
        set({ lastSyncedAt: iso });
      },
      setAutoSync: (autoSync) => set({ autoSync }),
      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        }
        set({ user: null, token: null, status: "idle", error: null });
      },
    }),
    {
      name: "santandc-sync-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        lastSyncedAt: s.lastSyncedAt,
        autoSync: s.autoSync,
      }),
    },
  ),
);

// Hydrate TOKEN_KEY fallback for legacy direct localStorage usage
if (typeof window !== "undefined") {
  try {
    const legacyToken = localStorage.getItem(TOKEN_KEY);
    const legacyUserRaw = localStorage.getItem(USER_KEY);
    if (legacyToken || legacyUserRaw) {
      const state = useSync.getState();
      if (!state.token && legacyToken) useSync.setState({ token: legacyToken });
      if (!state.user && legacyUserRaw) {
        try {
          const parsed = JSON.parse(legacyUserRaw) as SyncUser;
          if (parsed?.id && parsed?.email) useSync.setState({ user: parsed });
        } catch { /* ignore */ }
      }
    }
    const legacyLast = localStorage.getItem(LAST_SYNC_KEY);
    if (legacyLast && !useSync.getState().lastSyncedAt) useSync.setState({ lastSyncedAt: legacyLast });
  } catch { /* ignore */ }
}

function authHeaders(): HeadersInit {
  const token = useSync.getState().token || (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// --- API transport ---

export type ApiErrorKind = "unauthorized" | "not-found" | "validation" | "server" | "network";

export class SyncApiError extends Error {
  status: number;
  kind: ApiErrorKind;
  constructor(message: string, status: number, kind: ApiErrorKind) {
    super(message);
    this.name = "SyncApiError";
    this.status = status;
    this.kind = kind;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new SyncApiError("Can’t reach the sync server — check your connection.", 0, "network");
  }

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Non-JSON body = the route isn't served by the app (static host / stale deploy)
      if (!res.ok) {
        throw new SyncApiError(
          res.status === 404
            ? `Sync API not found (404) at ${path}. This deployment is probably serving only the frontend — redeploy with the server build so /api routes exist. Open /api/health to check.`
            : `Sync server returned an unexpected response (${res.status}) from ${path}. Open /api/health to check.`,
          res.status,
          res.status === 404 ? "not-found" : "server",
        );
      }
    }
  }

  if (!res.ok) {
    const message =
      (typeof data.statusMessage === "string" && data.statusMessage) ||
      (typeof data.message === "string" && data.message) ||
      `Request failed (${res.status})`;
    let kind: ApiErrorKind = "server";
    if (res.status === 401 || res.status === 403) kind = "unauthorized";
    else if (res.status === 400 || res.status === 422) kind = "validation";
    else if (res.status === 404) kind = "not-found";
    throw new SyncApiError(message, res.status, kind);
  }

  return data as T;
}

/**
 * Called when the server says our token is invalid or the account is gone.
 * The usual cause on Vercel: the app was redeployed and its ephemeral /tmp
 * storage was wiped, so the user record no longer exists.
 */
function handleSessionLost(reason: string) {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  useSync.setState({
    user: null,
    token: null,
    status: "error",
    error: reason,
  });
}

function describeAuthFailure(err: SyncApiError): string {
  const msg = err.message.toLowerCase();
  if (msg.includes("user not found") || msg.includes("account")) {
    return "This account no longer exists on the server. Server storage was reset (Vercel only keeps /tmp temporarily). Your local journal is safe — sign up again with the same email to re-upload it, or add Vercel KV to keep accounts permanently.";
  }
  if (msg.includes("expired")) {
    return "Session expired — sign in again. Your local journal is untouched.";
  }
  return err.message;
}

// --- API helpers ---

export async function register(email: string, password: string): Promise<{ token: string; user: SyncUser }> {
  return apiRequest<{ token: string; user: SyncUser }>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
}

export async function login(email: string, password: string): Promise<{ token: string; user: SyncUser }> {
  return apiRequest<{ token: string; user: SyncUser }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
}

export async function fetchMe(): Promise<SyncUser | null> {
  const headers = authHeaders() as Record<string, string>;
  if (!headers.Authorization) return null;
  try {
    const data = await apiRequest<{ user: SyncUser }>("/api/auth/me", { headers });
    return data.user ?? null;
  } catch (err) {
    if (err instanceof SyncApiError) {
      if (err.kind === "unauthorized") {
        handleSessionLost(describeAuthFailure(err));
      } else {
        // 404 / server / network: don't pretend the session expired — say what happened.
        useSync.getState().setStatus("error", err.message);
      }
    }
    return null;
  }
}

export type ServerHealth = {
  ok: boolean;
  env?: string;
  storage?: {
    driver?: string;
    persistent?: boolean;
    detail?: string;
    probe?: { ok?: boolean; detail?: string };
    accounts?: number;
  };
  accounts?: number;
  authSecretSet?: boolean;
  hint?: string;
};

/** Ask the deployment which storage driver it uses, so the UI can warn before data is lost. */
export async function checkHealth(): Promise<ServerHealth | null> {
  try {
    return await apiRequest<ServerHealth>("/api/health", { headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
}

export async function pullBackup(): Promise<{ backup: JournalBackup | null; updatedAt: string | null }> {
  const headers = authHeaders() as Record<string, string>;
  if (!headers.Authorization) throw new SyncApiError("Not signed in", 401, "unauthorized");
  try {
    return await apiRequest<{ backup: JournalBackup | null; updatedAt: string | null }>("/api/sync", { headers });
  } catch (err) {
    if (err instanceof SyncApiError && err.kind === "unauthorized") {
      const friendly = describeAuthFailure(err);
      handleSessionLost(friendly);
      throw new SyncApiError(friendly, err.status, err.kind);
    }
    throw err;
  }
}

export async function pushBackup(backup: JournalBackup, opts: { force?: boolean } = {}): Promise<{ backup: JournalBackup; updatedAt: string }> {
  const headers = { ...(authHeaders() as Record<string, string>), "Content-Type": "application/json" } as HeadersInit;
  if (!(headers as Record<string, string>).Authorization) throw new SyncApiError("Not signed in", 401, "unauthorized");
  const lastSyncedAt = useSync.getState().lastSyncedAt;
  try {
    return await apiRequest<{ backup: JournalBackup; updatedAt: string; version: number }>("/api/sync", {
      method: "PUT",
      headers,
      body: JSON.stringify({ backup, lastSyncedAt, force: opts.force ?? false }),
    });
  } catch (err) {
    if (err instanceof SyncApiError && err.kind === "unauthorized") {
      const friendly = describeAuthFailure(err);
      handleSessionLost(friendly);
      throw new SyncApiError(friendly, err.status, err.kind);
    }
    throw err;
  }
}

// --- Merge helper (client-side, mirrors server) ---

function pickNewer<T extends { updatedAt?: string; createdAt?: string }>(a: T, b: T): T {
  const at = a.updatedAt || a.createdAt || "";
  const bt = b.updatedAt || b.createdAt || "";
  if (!at) return b;
  if (!bt) return a;
  return bt >= at ? b : a;
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

// Deletion-aware merge: if lastSyncedAt is set, a remote entity that existed at lastSync
// but is missing locally is considered intentionally deleted.
function isDeleted(missingRemoteUpdatedAt: string, lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return false;
  // If remote entity was last updated before or at last sync, and local doesn't have it, it was deleted locally after sync
  return missingRemoteUpdatedAt <= lastSyncedAt;
}

export function mergeBackups(local: JournalBackup, remote: JournalBackup, opts: { lastSyncedAt?: string | null } = {}): JournalBackup {
  const lastSyncedAt = opts.lastSyncedAt ?? useSync.getState().lastSyncedAt ?? null;
  const tradesMap = new Map<string, JournalBackup["trades"][number]>();
  for (const t of local.trades) tradesMap.set(t.id, t);
  for (const t of remote.trades) {
    const prev = tradesMap.get(t.id);
    if (!prev) {
      // Remote has trade that local doesn't: keep it unless it was deleted locally
      const remoteUpdated = t.updatedAt || t.createdAt || remote.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      tradesMap.set(t.id, t);
    } else tradesMap.set(t.id, pickNewer(prev, t) as typeof t);
  }
  const playbooksMap = new Map<string, JournalBackup["playbooks"][number]>();
  for (const p of local.playbooks) playbooksMap.set(p.id, p);
  for (const p of remote.playbooks) {
    const prev = playbooksMap.get(p.id);
    if (!prev) {
      const remoteUpdated = p.updatedAt || remote.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      playbooksMap.set(p.id, p);
    } else playbooksMap.set(p.id, pickNewer(prev, p) as typeof p);
  }
  const dayEntries: JournalBackup["dayEntries"] = { ...local.dayEntries };
  for (const [key, entry] of Object.entries(remote.dayEntries)) {
    const prev = dayEntries[key];
    if (!prev) {
      const remoteUpdated = entry.updatedAt || remote.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      dayEntries[key] = entry;
    } else dayEntries[key] = pickNewer(prev, entry);
  }
  const reviewsMap = new Map<string, JournalBackup["weeklyReviews"][number]>();
  for (const r of local.weeklyReviews) reviewsMap.set(r.id, r);
  for (const r of remote.weeklyReviews) {
    const prev = reviewsMap.get(r.id);
    if (!prev) {
      const remoteUpdated = r.updatedAt || remote.updatedAt || "";
      if (isDeleted(remoteUpdated, lastSyncedAt)) continue;
      reviewsMap.set(r.id, r);
    } else reviewsMap.set(r.id, pickNewer(prev, r) as typeof r);
  }
  const rulesMap = new Map<string, JournalBackup["rules"][number]>();
  for (const r of local.rules) rulesMap.set(r.id, r);
  for (const r of remote.rules) {
    if (!rulesMap.has(r.id)) {
      // Rules have no timestamp — use backup-level timestamp heuristic; if locally we have 0 rules and remote has some, but lastSyncedAt exists and local updatedAt is newer, treat as deleted
      const localUpdated = local.updatedAt || "";
      const remoteUpdated = remote.updatedAt || "";
      if (lastSyncedAt && local.trades.length === 0 && local.rules.length === 0 && localUpdated > (remoteUpdated || "")) continue;
      rulesMap.set(r.id, r);
    } else rulesMap.set(r.id, r);
  }
  const checks: JournalBackup["checks"] = { ...local.checks };
  for (const [date, ids] of Object.entries(remote.checks)) {
    const prev = checks[date] ?? [];
    // For checks, union is safe; if local deleted a date's checks, remote's date might reappear — acceptable edge case
    checks[date] = [...new Set([...prev, ...ids])];
  }
  const remoteRecent = mostRecentTimestamp(remote);
  const localRecent = mostRecentTimestamp(local);
  const remoteIsNewer = remoteRecent >= localRecent;

  return {
    version: 4,
    startingBalance: remoteIsNewer ? remote.startingBalance : local.startingBalance,
    trades: [...tradesMap.values()].sort((a, b) => b.closedAt.localeCompare(a.closedAt)),
    rules: [...rulesMap.values()],
    checks,
    sampleBanner: false,
    playbooks: [...playbooksMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    activePlaybookId: remoteIsNewer ? remote.activePlaybookId : local.activePlaybookId ?? remote.activePlaybookId,
    dayEntries,
    weeklyReviews: [...reviewsMap.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    updatedAt: local.updatedAt && remote.updatedAt ? (local.updatedAt >= remote.updatedAt ? local.updatedAt : remote.updatedAt) : local.updatedAt ?? remote.updatedAt ?? new Date().toISOString(),
  };
}

// Build current backup from store (for push)
export function getCurrentBackup(): JournalBackup {
  const s = useJournal.getState();
  return {
    version: 4,
    startingBalance: s.startingBalance,
    trades: s.trades,
    rules: s.rules,
    checks: s.checks,
    sampleBanner: s.sampleBanner,
    playbooks: s.playbooks,
    activePlaybookId: s.activePlaybookId,
    dayEntries: s.dayEntries,
    weeklyReviews: s.weeklyReviews,
    updatedAt: s.updatedAt,
  };
}

export async function syncNow(options: { direction?: "push" | "pull" | "both" } = {}): Promise<void> {
  const { direction = "both" } = options;
  const sync = useSync.getState();
  if (!sync.user || !sync.token) throw new Error("Not signed in");
  useSync.getState().setStatus("syncing");

  try {
    if (direction === "push" || direction === "both") {
      // If we have no remote, push local
      // If we have remote, we should pull first to merge, then push merged
      if (direction === "both") {
        const pulled = await pullBackup();
        if (pulled.backup) {
          const local = getCurrentBackup();
          // Validate remote backup shape before merge
          const remoteParsed = parseBackup(JSON.stringify(pulled.backup));
          const remote = remoteParsed.ok ? remoteParsed.data : pulled.backup;
          const merged = mergeBackups(local, remote);
          // Only replace if merged differs from local (quick check via trade count or JSON)
          const localStr = JSON.stringify(local);
          const mergedStr = JSON.stringify(merged);
          if (localStr !== mergedStr) {
            useJournal.getState().replaceAll(merged);
            const pushed = await pushBackup(merged);
            useSync.getState().setLastSyncedAt(pushed.updatedAt);
            useSync.getState().setStatus("synced");
            return;
          } else {
            // Even if merged equals local, still ensure server is up to date (handles deletions where merged==local but server has extra)
            const lastSyncedAt = useSync.getState().lastSyncedAt;
            const remoteHasExtra = remote.trades.length !== local.trades.length || Object.keys(remote.dayEntries).length !== Object.keys(local.dayEntries).length || remote.weeklyReviews.length !== local.weeklyReviews.length;
            if (remoteHasExtra && lastSyncedAt) {
              const pushed = await pushBackup(local);
              useSync.getState().setLastSyncedAt(pushed.updatedAt);
              useSync.getState().setStatus("synced");
              return;
            }
          }
        }
      }
      // Fallback push local (handles clear: local empty should force delete on server)
      const backup = getCurrentBackup();
      const pushed = await pushBackup(backup);
      useSync.getState().setLastSyncedAt(pushed.updatedAt);
      useSync.getState().setStatus("synced");
    } else if (direction === "pull") {
      const pulled = await pullBackup();
      if (!pulled.backup) {
        useSync.getState().setStatus("synced");
        return;
      }
      const remoteParsed = parseBackup(JSON.stringify(pulled.backup));
      const remote = remoteParsed.ok ? remoteParsed.data : pulled.backup;
      const local = getCurrentBackup();
      const merged = mergeBackups(local, remote);
      const mergedStr = JSON.stringify(merged);
      const localStr = JSON.stringify(local);
      if (mergedStr !== localStr) {
        useJournal.getState().replaceAll(merged);
      }
      useSync.getState().setLastSyncedAt(pulled.updatedAt ?? new Date().toISOString());
      useSync.getState().setStatus("synced");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isNetwork = err instanceof SyncApiError ? err.kind === "network" : /fetch|network|Failed to fetch/i.test(msg);
    useSync.getState().setStatus(isNetwork ? "offline" : "error", msg);
    throw err;
  }
}

let syncDebounce: number | null = null;
let syncUnsub: (() => void) | null = null;

export function setupAutoSync() {
  // Called once after hydration; subscribes to journal store changes
  if (syncUnsub) syncUnsub();
  const journal = useJournal;

  syncUnsub = journal.subscribe((state, prev) => {
    const sync = useSync.getState();
    if (!sync.user || !sync.token || !sync.autoSync) return;
    // Only push if data actually changed
    const keys: (keyof typeof state)[] = ["trades", "rules", "checks", "playbooks", "activePlaybookId", "dayEntries", "weeklyReviews", "startingBalance"];
    const changed = keys.some((k) => (state as Record<string, unknown>)[k] !== (prev as Record<string, unknown>)[k]);
    if (!changed) return;

    if (syncDebounce) window.clearTimeout(syncDebounce);
    syncDebounce = window.setTimeout(() => {
      syncNow({ direction: "push" }).catch(() => {
        // error already set in store
      });
    }, 2000);
  });

  // Initial pull on load if signed in
  const sync = useSync.getState();
  if (sync.user && sync.token) {
    // Verify token still valid, then sync
    fetchMe().then((user) => {
      if (!user) {
        // fetchMe already set a specific message when the token/account is invalid
        if (useSync.getState().status !== "error") {
          useSync.getState().setStatus("error", "Session expired — sign in again. Your local journal is safe.");
        }
        return;
      }
      syncNow({ direction: "both" }).catch(() => {});
    });
  }

  // Sync on visibility change (tab regain focus)
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      const s = useSync.getState();
      if (s.user && s.token && s.autoSync) syncNow({ direction: "both" }).catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  // Sync on window focus
  const onFocus = () => {
    const s = useSync.getState();
    if (s.user && s.token && s.autoSync) syncNow({ direction: "both" }).catch(() => {});
  };
  window.addEventListener("focus", onFocus);

  return () => {
    if (syncUnsub) syncUnsub();
    if (syncDebounce) window.clearTimeout(syncDebounce);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
  };
}
