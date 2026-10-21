// Shared failure mapping for API routes.
//
// Operator misconfiguration (no AUTH_SECRET, unreachable database) used to
// surface as an unhandled 500 with an empty body, which reads to users like
// "the app is broken". These helpers turn those cases into a 503 whose
// statusMessage says exactly what to fix; the client displays it verbatim.
// Keep statusMessage text ASCII-only: Node rejects non-latin1 status text.

import { createError } from "h3";
import { AuthConfigError, createToken, getAuthConfigError } from "./auth.ts";

export const AUTH_CONFIG_MESSAGE =
  "Sign-in is not configured on this server yet: set AUTH_SECRET (32+ random characters) in the deployment environment variables, then redeploy. See /api/health for details.";

export const STORAGE_MESSAGE =
  "Account storage is unavailable on this server right now. See /api/health for the storage status, then try again.";

/** Fail fast with an actionable 503 before doing any auth work (or DB writes). */
export function assertAuthConfigured(): void {
  const problem = getAuthConfigError();
  if (problem) {
    console.error(`[auth] sign-in blocked: ${problem}`);
    throw createError({ statusCode: 503, statusMessage: AUTH_CONFIG_MESSAGE });
  }
}

/** Run a storage call; driver failures become a 503 instead of a bare 500. */
export async function storageOr503<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[storage] ${label} failed`, err);
    throw createError({ statusCode: 503, statusMessage: STORAGE_MESSAGE });
  }
}

/** Sign a session token, mapping config problems to 503 and the rest to a safe 500. */
export async function createSessionToken(user: { id: string; email: string }): Promise<string> {
  try {
    return await createToken({ sub: user.id, email: user.email });
  } catch (err) {
    if (err instanceof AuthConfigError) {
      console.error(`[auth] sign-in blocked: ${err.message}`);
      throw createError({ statusCode: 503, statusMessage: AUTH_CONFIG_MESSAGE });
    }
    console.error("[auth] token creation failed", err);
    throw createError({ statusCode: 500, statusMessage: "Could not create a sign-in session. Try again." });
  }
}
