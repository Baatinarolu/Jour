import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ALG = "HS256";
const ISSUER = "santandc";
const EXPIRY = "30d";
const MIN_SECRET_LENGTH = 32;
/** The literal value shipped in .env.example. Publicly known, so never valid in production. */
const PLACEHOLDER_SECRET = "change-me-to-a-long-random-string-at-least-32-chars";
const MISSING_SECRET_MESSAGE =
  "AUTH_SECRET is not set and no durable storage is available to hold a managed sign-in secret. Set AUTH_SECRET (at least 32 characters) or attach a Neon/Postgres database or Redis store.";
const developmentKey = crypto.getRandomValues(new Uint8Array(32));

/** Sign-in cannot work because the deployment has no usable signing secret. */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

function envSecret(): string | undefined {
  return process.env.AUTH_SECRET || process.env.JWT_SECRET || undefined;
}

/** True when a real (non-placeholder, 32+ char) secret is set in the environment. */
export function hasEnvSecret(): boolean {
  const secret = envSecret();
  return !!secret && secret.length >= MIN_SECRET_LENGTH && secret !== PLACEHOLDER_SECRET;
}

/**
 * Problem with an explicitly configured AUTH_SECRET, or null. A *missing*
 * env secret is not an error by itself: production falls back to a managed
 * secret stored in the database, development to an ephemeral key.
 * An explicitly set but invalid secret always fails loudly instead of
 * being silently overridden.
 */
export function getAuthConfigError(): string | null {
  const secret = envSecret();
  if (!secret) return null;
  if (secret.length < MIN_SECRET_LENGTH) {
    return "AUTH_SECRET must contain at least 32 characters.";
  }
  if (secret === PLACEHOLDER_SECRET && process.env.NODE_ENV === "production") {
    return "AUTH_SECRET is still the placeholder value from .env.example. Set your own random secret of at least 32 characters.";
  }
  return null;
}

// ── Managed secret (generated once, stored in the durable database) ──

type ManagedSecretLoader = (candidate: string) => Promise<string | null>;

let managedSecretLoader: ManagedSecretLoader | null = null;
let managedKeyPromise: Promise<Uint8Array> | null = null;

/** Test hook: inject the storage loader (null restores the database default). */
export function setManagedSecretLoaderForTests(loader: ManagedSecretLoader | null): void {
  managedSecretLoader = loader;
  managedKeyPromise = null;
}

function generateSecretCandidate(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
}

async function defaultManagedLoader(candidate: string): Promise<string | null> {
  const { getOrCreateManagedAuthSecret } = await import("./db.ts");
  return getOrCreateManagedAuthSecret(candidate);
}

function loadManagedKey(): Promise<Uint8Array> {
  if (!managedKeyPromise) {
    managedKeyPromise = (async () => {
      const loader = managedSecretLoader ?? defaultManagedLoader;
      const stored = await loader(generateSecretCandidate());
      if (!stored || stored.length < MIN_SECRET_LENGTH) {
        throw new AuthConfigError(MISSING_SECRET_MESSAGE);
      }
      return new TextEncoder().encode(stored);
    })().catch((err) => {
      // Never cache a failure: the next request retries (e.g. DB was down).
      managedKeyPromise = null;
      throw err;
    });
  }
  return managedKeyPromise;
}

/** Signing key precedence: valid env secret → dev key (non-prod) → managed DB secret. */
async function resolveSecretKey(): Promise<Uint8Array> {
  const problem = getAuthConfigError();
  if (problem) throw new AuthConfigError(problem);
  const secret = envSecret();
  if (secret) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV !== "production") return developmentKey;
  return loadManagedKey();
}

export type AuthReadiness = {
  ready: boolean;
  source: "env" | "managed" | "dev" | null;
  problem: string | null;
};

/** Whether sign-in can work right now, and where the signing secret comes from. */
export async function getAuthReadiness(): Promise<AuthReadiness> {
  const problem = getAuthConfigError();
  if (problem) return { ready: false, source: null, problem };
  if (envSecret()) return { ready: true, source: "env", problem: null };
  if (process.env.NODE_ENV !== "production") return { ready: true, source: "dev", problem: null };
  try {
    await loadManagedKey();
    return { ready: true, source: "managed", problem: null };
  } catch (err) {
    return {
      ready: false,
      source: null,
      problem: err instanceof AuthConfigError ? err.message : MISSING_SECRET_MESSAGE,
    };
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type AuthTokenPayload = {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
};

export async function createToken(payload: { sub: string; email: string }): Promise<string> {
  return new SignJWT({ email: payload.email } as JWTPayload)
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(await resolveSecretKey());
}

export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await resolveSecretKey(), { issuer: ISSUER });
    if (!payload.sub || !payload.email) return null;
    return { sub: payload.sub as string, email: payload.email as string, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]!.trim() : null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}
