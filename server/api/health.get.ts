import { defineEventHandler } from "h3";
import { storageDiagnostics } from "../lib/db.ts";

export default defineEventHandler(async () => {
  const storage = await storageDiagnostics();
  const hasAuthSecret = !!(process.env.AUTH_SECRET || process.env.JWT_SECRET);

  return {
    ok: true,
    time: new Date().toISOString(),
    env: process.env.VERCEL ? "vercel" : process.env.NODE_ENV || "dev",
    storage,
    authSecretSet: hasAuthSecret,
    hint: !storage.persistent
      ? "Accounts are stored in /tmp and are wiped on redeploy or cold start. Attach a Postgres database (Supabase) or a KV store so the project gets POSTGRES_URL / KV_REST_API_URL, then redeploy."
      : !storage.probe.ok
        ? `Database is configured but not usable: ${storage.probe.detail}`
        : !hasAuthSecret
          ? "Add AUTH_SECRET (32+ random characters) so sessions stay valid across deploys."
          : "Storage and auth are configured for persistence.",
  };
});
