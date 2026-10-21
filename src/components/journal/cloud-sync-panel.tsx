import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextField } from "@/components/ui/field";
import {
  useSync,
  login,
  register,
  syncNow,
  fetchMe,
  checkHealth,
  type ServerHealth,
} from "@/lib/journal/sync";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const LAST_EMAIL_KEY = "santandc-last-email";

type HealthState = "checking" | "ok" | "unreachable";

export function CloudSyncPanel() {
  const user = useSync((s) => s.user);
  const status = useSync((s) => s.status);
  const lastSyncedAt = useSync((s) => s.lastSyncedAt);
  const error = useSync((s) => s.error);
  const autoSync = useSync((s) => s.autoSync);
  const setUser = useSync((s) => s.setUser);
  const setStatus = useSync((s) => s.setStatus);
  const setAutoSync = useSync((s) => s.setAutoSync);
  const logout = useSync((s) => s.logout);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const [showFix, setShowFix] = useState(false);

  // Remember the last email so re-creating an account after a server wipe is one click.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_EMAIL_KEY);
      if (saved) setEmail((current) => current || saved);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    setHealthState("checking");
    const result = await checkHealth();
    setHealth(result);
    setHealthState(result ? "ok" : "unreachable");
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  // Verify session on mount if token exists but user missing
  useEffect(() => {
    if (useSync.getState().token && !useSync.getState().user) {
      fetchMe().then((u) => {
        if (u) useSync.setState({ user: u });
        else if (useSync.getState().status !== "error") {
          setStatus("error", "Session expired — sign in again. Your local journal is safe.");
        }
      });
    }
  }, [setStatus]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setStatus("syncing");
    try {
      const fn = mode === "login" ? login : register;
      const res = await fn(email.trim(), password);
      setUser(res.user, res.token);
      try {
        localStorage.setItem(LAST_EMAIL_KEY, res.user.email);
      } catch {
        /* ignore */
      }
      setMsg(mode === "login" ? "Signed in — syncing…" : "Account created — syncing…");
      setStatus("syncing");
      await syncNow({ direction: "both" });
      setHealthState("checking");
      void refreshHealth();
      setMsg("Synced to cloud");
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      const accountMissing = /no longer exists|user not found/i.test(m);
      if (accountMissing) {
        setMode("register");
        setStatus("error", m);
        setMsg("Your account is gone from this server — create it again below to re-upload this journal.");
      } else {
        setMsg(m);
        setStatus("error", m);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncNow() {
    setBusy(true);
    setMsg(null);
    setStatus("syncing");
    try {
      await syncNow({ direction: "both" });
      setMsg("Synced");
      setStatus("synced");
      setHealthState("checking");
      void refreshHealth();
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setMsg(m);
    } finally {
      setBusy(false);
    }
  }

  const ephemeral = health?.storage?.persistent === false;
  const healthUnknown = healthState === "unreachable";
  const configuredButBroken = health?.storage?.persistent === true && health?.storage?.probe?.ok === false;
  // On a real deployment (Vercel / production) a missing AUTH_SECRET makes
  // sign-in fail outright, so warn before the user submits the form.
  // Local dev works without one (ephemeral dev key), so don't nag there.
  const authNotConfigured =
    health?.authSecretSet === false && (health?.env === "vercel" || health?.env === "production");

  const authBanner = authNotConfigured ? (
    <div className="mt-4 flex items-start gap-2 rounded-sm border border-down/40 bg-down/5 p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-down" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-down">Sign-in is not configured on this server</p>
        <p className="mt-1 text-xs text-muted">
          <span className="font-mono">AUTH_SECRET</span> is missing (or still the example placeholder), so creating an account or
          signing in will fail. Whoever runs this deployment needs to set <span className="font-mono">AUTH_SECRET</span> to a random
          string of 32+ characters (for example the output of <span className="font-mono">openssl rand -hex 32</span>) under Vercel →
          Settings → Environment Variables, then redeploy. Your journal on this device keeps working offline.
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refreshHealth()}>
          <RefreshCw className="size-3.5" /> Check again
        </Button>
      </div>
    </div>
  ) : null;

  const storageBanner = configuredButBroken ? (
    <div className="mt-4 flex items-start gap-2 rounded-sm border border-down/40 bg-down/5 p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-down" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-down">Database configured but not reachable</p>
        <p className="mt-1 break-words text-xs text-muted">{health?.storage?.probe?.detail}</p>
        <p className="mt-1 text-xs text-muted">
          Check the connection string in Vercel → Settings → Environment Variables (<span className="font-mono">DATABASE_URL</span> / <span className="font-mono">POSTGRES_URL</span>), then redeploy.{" "}
          {health?.hint}
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refreshHealth()}>
          <RefreshCw className="size-3.5" /> Check again
        </Button>
      </div>
    </div>
  ) : healthUnknown ? (
    <div className="mt-4 flex items-start gap-2 rounded-sm border border-down/40 bg-down/5 p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-down" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-down">Sync server not reachable</p>
        <p className="mt-1 text-xs text-muted">
          <span className="font-mono">/api/health</span> did not answer. If you’ve deployed to Vercel, make sure the deploy included the
          server build (the <span className="font-mono">.vercel/output</span> folder produced by <span className="font-mono">npm run build</span>),
          then reload.
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refreshHealth()}>
          <RefreshCw className="size-3.5" /> Check again
        </Button>
      </div>
    </div>
  ) : ephemeral ? (
    <div className="mt-4 flex items-start gap-2 rounded-sm border border-warn/40 bg-warn/5 p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="min-w-0">
        <p className="text-xs font-medium">This deployment forgets accounts on redeploy</p>
        <p className="mt-1 text-xs text-muted">
          The server is using ephemeral <span className="font-mono">/tmp</span> storage — Vercel wipes it on every deploy and cold start, which is
          why your account “disappears”. Your journal on this device is safe; the copy in the cloud is not.
        </p>
        <button type="button" className="mt-2 text-xs font-medium text-accent underline-offset-2 hover:underline" onClick={() => setShowFix((v) => !v)}>
          {showFix ? "Hide fix" : "How to make it permanent (2 minutes)"}
        </button>
        {showFix ? (
          <ol className="mt-2 grid gap-1 text-xs text-muted">
            <li>1. Create a Neon database: Vercel → your project → <span className="font-medium">Storage</span> → <span className="font-medium">Create Database</span> → <span className="font-medium">Neon</span>, and connect it to the project (any Postgres or Upstash KV also works).</li>
            <li>2. Vercel then injects <span className="font-mono">DATABASE_URL</span> (or <span className="font-mono">KV_REST_API_URL</span>) automatically — no code change.</li>
            <li>3. Add an <span className="font-mono">AUTH_SECRET</span> env var (32+ random characters, e.g. <span className="font-mono">openssl rand -hex 32</span>) — sign-in cannot work without it.</li>
            <li>4. Redeploy. This panel will say <span className="font-medium">Storage: persistent</span>.</li>
          </ol>
        ) : null}
      </div>
    </div>
  ) : health ? (
    <div className="mt-4 flex items-start gap-2 rounded-sm border border-up/30 bg-up/5 p-3">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-up" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-up">Storage: persistent</p>
        <p className="mt-1 text-xs text-muted">
          {typeof health.storage?.accounts === "number" ? `${health.storage.accounts} account${health.storage.accounts === 1 ? "" : "s"} on this server · ` : ""}
          {health.storage?.detail ?? health.storage?.driver}
          {health.storage?.probe?.detail ? ` · ${health.storage.probe.detail}` : ""}
        </p>
      </div>
    </div>
  ) : null;

  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-sm bg-card-2 p-2">
            <CloudOff className="size-5 text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">Cloud sync — private backup across devices</h3>
            <p className="mt-1 text-sm text-muted">
              Your journal stays local by default. Sign in to sync trades, playbooks, daily entries and reviews. Same journal on phone + desktop;
              offline edits merge when you reconnect.
            </p>
            <p className="mt-2 text-xs text-subtle">
              Encrypted in transit (HTTPS). Stored per-account on your own deployment.
            </p>
          </div>
        </div>

        {authBanner}
        {storageBanner}

        <div className="mt-4 flex gap-2 rounded-sm bg-background p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-sm px-3 py-2 font-medium ${mode === "login" ? "bg-accent text-accent-foreground" : "text-muted"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-sm px-3 py-2 font-medium ${mode === "register" ? "bg-accent text-accent-foreground" : "text-muted"}`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleAuth} className="mt-4 grid gap-3">
          <div>
            <FieldLabel htmlFor="cloud-email">Email</FieldLabel>
            <TextField
              id="cloud-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="cloud-password">Password (min 8)</FieldLabel>
            <TextField
              id="cloud-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>
          {msg ? <p className={`text-sm ${status === "error" ? "text-down" : "text-muted"}`}>{msg}</p> : null}
          {error && !msg ? <p className="text-sm text-down">{error}</p> : null}
          <Button type="submit" disabled={busy || !email.trim() || password.length < 8}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {mode === "login" ? "Sign in & sync" : "Create account & sync"}
          </Button>
          <p className="text-xs text-subtle">
            No email verification — keep your password safe. You can still use download/restore backups without an account.
          </p>
        </form>
      </div>
    );
  }

  const lastAgo = lastSyncedAt
    ? (() => {
        try {
          return formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true });
        } catch {
          return lastSyncedAt;
        }
      })()
    : "never";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-sm bg-up/10 p-2">
            <Cloud className="size-5 text-up" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Cloud sync on</h3>
            <p className="text-sm text-muted">{user.email}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs">
              {status === "syncing" ? (
                <>
                  <Loader2 className="size-3 animate-spin text-muted" /> <span className="text-muted">Syncing…</span>
                </>
              ) : status === "error" ? (
                <span className="text-down">Error — {error ?? "check connection"}</span>
              ) : status === "offline" ? (
                <span className="text-muted">Offline — will retry on reconnect</span>
              ) : (
                <span className="text-subtle">
                  Last synced {lastAgo} · {autoSync ? "Auto-sync on" : "Manual only"}
                </span>
              )}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Log out" title="Sign out" onClick={() => logout()}>
          <LogOut className="size-4" />
        </Button>
      </div>

      {authBanner}
      {storageBanner}

      {msg ? <p className="mt-3 text-sm text-muted">{msg}</p> : null}
      {error && status === "error" ? <p className="mt-2 text-sm text-down">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={handleSyncNow} disabled={busy || status === "syncing"}>
          <RefreshCw className={`size-4 ${busy || status === "syncing" ? "animate-spin" : ""}`} />
          Sync now
        </Button>
        <Button
          variant={autoSync ? "secondary" : "ghost"}
          onClick={() => setAutoSync(!autoSync)}
          title={autoSync ? "Turn off auto-sync (manual only)" : "Turn on auto-sync"}
        >
          <Cloud className="size-4" />
          {autoSync ? "Auto-sync on" : "Auto-sync off"}
        </Button>
        <Button variant="ghost" onClick={() => void refreshHealth()} disabled={healthState === "checking"}>
          <ShieldCheck className="size-4" />
          {healthState === "checking" ? "Checking…" : "Check server"}
        </Button>
      </div>

      <p className="mt-3 text-xs text-subtle">
        Edits merge by updated time — newer wins per trade/playbook/day so you don’t lose phone edits when desktop pushes. Deletions sync too: if you
        erase a trade locally after syncing, it’s removed in the cloud on next push. Screenshots count toward size; max backup ~10 MB.
      </p>

      <div className="mt-4 rounded-sm border border-border bg-background p-3">
        <p className="text-xs font-medium text-muted">Demo keeps coming back?</p>
        <p className="mt-1 text-xs text-subtle">
          Use “Clear cloud” to force-replace the cloud copy with your current local journal — handy if an earlier merge left orphaned demo data.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={busy || status === "syncing"}
          onClick={async () => {
            if (!confirm("Replace the cloud journal with your current local journal? Use this if demo data keeps reappearing after erase.")) return;
            setBusy(true);
            setMsg(null);
            setStatus("syncing");
            try {
              const { getCurrentBackup, pushBackup } = await import("@/lib/journal/sync");
              const backup = getCurrentBackup();
              // Force replace — tells server to skip merge and take local as truth
              const pushed = await pushBackup(backup, { force: true });
              useSync.getState().setLastSyncedAt(pushed.updatedAt);
              setStatus("synced");
              setMsg("Cloud now matches local — demo cleared if local was empty.");
            } catch (err) {
              const m = err instanceof Error ? err.message : String(err);
              setMsg(m);
              setStatus("error", m);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Trash2 className="size-3.5" />
          Clear cloud (force push local)
        </Button>
      </div>
    </div>
  );
}
