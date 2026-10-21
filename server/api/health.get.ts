import { defineEventHandler } from "h3";
import { getAuthReadiness, hasEnvSecret } from "../lib/auth.ts";
import { storageDiagnostics } from "../lib/db.ts";

export default defineEventHandler(async () => {
  const storage = await storageDiagnostics();
  const auth = await getAuthReadiness();

  // List every blocker, auth first: when sign-in cannot work at all, it must
  // never be hidden behind a storage hint.
  const problems: string[] = [];
  if (!auth.ready && auth.problem) {
    const isMissing = auth.problem.startsWith("AUTH_SECRET is not set");
    problems.push(
      isMissing
        ? `Sign-in is disabled: ${auth.problem}`
        : `Sign-in is disabled: ${auth.problem} Fix AUTH_SECRET in the deployment environment variables (for example the output of "openssl rand -hex 32"), then redeploy.`,
    );
  }
  if (!storage.persistent) {
    problems.push(
      "Accounts are stored in /tmp and are wiped on redeploy or cold start. Attach a Neon Postgres database (Vercel → Storage → Create Database → Neon) or a KV store so the project gets DATABASE_URL / KV_REST_API_URL, then redeploy.",
    );
  } else if (!storage.probe.ok) {
    problems.push(`Database is configured but not usable: ${storage.probe.detail}`);
  }

  return {
    ok: storage.probe.ok && auth.ready,
    time: new Date().toISOString(),
    env: process.env.VERCEL ? "vercel" : process.env.NODE_ENV || "dev",
    storage,
    authSecretSet: hasEnvSecret(),
    authReady: auth.ready,
    authSource: auth.source,
    hint: problems.length > 0 ? problems.join(" ") : "Storage and auth are configured for persistence.",
  };
});
