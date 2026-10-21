import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextField } from "@/components/ui/field";
import { useSync, login, register, syncNow, fetchMe } from "@/lib/journal/sync";
import { formatDistanceToNow } from "date-fns";
import { Cloud, CloudOff, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

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

  // Verify session on mount if token exists but user missing
  useEffect(() => {
    if (useSync.getState().token && !useSync.getState().user) {
      fetchMe().then((u) => {
        if (u) useSync.setState({ user: u });
        else setStatus("error", "Session expired");
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
      setMsg(mode === "login" ? "Signed in — syncing…" : "Account created — syncing…");
      setStatus("syncing");
      await syncNow({ direction: "both" });
      setMsg("Synced to cloud");
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setMsg(m);
      setStatus("error", m);
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
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setMsg(m);
    } finally {
      setBusy(false);
    }
  }

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
              Your journal stays local by default. Sign in to encrypt-sync trades, playbooks, daily entries and reviews. Same journal on phone + desktop; offline edits merge when you reconnect.
            </p>
            <p className="mt-2 text-xs text-subtle">
              Encrypted in transit (HTTPS). Stored per-account on your Vercel deployment. For teams needing Postgres-grade persistence, set <span className="font-mono">DATABASE_URL</span> — see README.
            </p>
          </div>
        </div>

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
      </div>

      <p className="mt-3 text-xs text-subtle">
        Edits merge by updated time — newer wins per trade/playbook/day so you don’t lose phone edits when desktop pushes. Screenshots count toward size; max backup ~10 MB.
      </p>
    </div>
  );
}
