import { defineEventHandler } from "h3";
import { getStorageDriver, getStorageInfo, listUsersCount, storageSelfTest } from "../lib/db.ts";

export default defineEventHandler(async () => {
  const driver = getStorageDriver();
  const info = getStorageInfo();
  const hasAuthSecret = !!(process.env.AUTH_SECRET || process.env.JWT_SECRET);
  const persistent = driver !== "file:ephemeral";
  const redis = await storageSelfTest();
  let accounts = 0;
  try {
    accounts = await listUsersCount();
  } catch {
    // count is diagnostic only
  }

  return {
    ok: true,
    time: new Date().toISOString(),
    env: process.env.VERCEL ? "vercel" : process.env.NODE_ENV || "dev",
    storage: {
      driver,
      persistent,
      detail: info,
      redis,
    },
    accounts,
    authSecretSet: hasAuthSecret,
    hint: !persistent
      ? "Accounts are stored in /tmp and are wiped on redeploy or cold start. Create a Vercel KV / Upstash Redis store (Storage → Create) so the project gets KV_REST_API_URL + KV_REST_API_TOKEN, then redeploy."
      : !hasAuthSecret
        ? "Add AUTH_SECRET (32+ random characters) so sessions stay valid across deploys."
        : "Storage and auth are configured for persistence.",
  };
});
