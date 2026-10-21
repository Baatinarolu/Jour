import { defineEventHandler } from "h3";
import { getAuthConfigError, hasEnvSecret } from "../lib/auth.ts";
import { storageDiagnostics } from "../lib/db.ts";

export default defineEventHandler(async () => {
  const storage = await storageDiagnostics();
  const authProblem = getAuthConfigError();

  // List every blocker, auth first: without AUTH_SECRET, sign-in cannot work
  // at all, so it must never be hidden behind a storage hint.
  const problems: string[] = [];
  if (authProblem) {
    problems.push(
      `Sign-in is disabled: ${authProblem} Set AUTH_SECRET to a long random string (for example the output of "openssl rand -hex 32") in the deployment environment variables, then redeploy.`,
    );
  }
  if (!storage.persistent) {
    problems.push(
      "Accounts are stored in /tmp and are wiped on redeploy or cold start. Attach a Postgres database (Supabase) or a KV store so the project gets POSTGRES_URL / KV_REST_API_URL, then redeploy.",
    );
  } else if (!storage.probe.ok) {
    problems.push(`Database is configured but not usable: ${storage.probe.detail}`);
  }

  return {
    ok: storage.probe.ok && authProblem === null,
    time: new Date().toISOString(),
    env: process.env.VERCEL ? "vercel" : process.env.NODE_ENV || "dev",
    storage,
    authSecretSet: hasEnvSecret(),
    hint: problems.length > 0 ? problems.join(" ") : "Storage and auth are configured for persistence.",
  };
});
