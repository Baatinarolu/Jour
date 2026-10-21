import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ALG = "HS256";
const ISSUER = "santandc";
const EXPIRY = "30d";
const MIN_SECRET_LENGTH = 32;
/** The literal value shipped in .env.example. Publicly known, so never valid in production. */
const PLACEHOLDER_SECRET = "change-me-to-a-long-random-string-at-least-32-chars";
const developmentKey = crypto.getRandomValues(new Uint8Array(32));

/** Sign-in cannot work because the deployment is missing a usable AUTH_SECRET. */
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
 * Why token signing would fail right now, or null when auth is usable.
 * In development a missing secret is fine (ephemeral per-process key);
 * in production it must be an operator error the API can report, not a 500.
 */
export function getAuthConfigError(): string | null {
  const secret = envSecret();
  if (secret) {
    if (secret.length < MIN_SECRET_LENGTH) {
      return "AUTH_SECRET must contain at least 32 characters.";
    }
    if (secret === PLACEHOLDER_SECRET && process.env.NODE_ENV === "production") {
      return "AUTH_SECRET is still the placeholder value from .env.example. Set your own random secret of at least 32 characters.";
    }
    return null;
  }
  if (process.env.NODE_ENV === "production") {
    return "AUTH_SECRET is not set. It must contain at least 32 characters.";
  }
  return null;
}

function secretKey(): Uint8Array {
  const problem = getAuthConfigError();
  if (problem) throw new AuthConfigError(problem);
  const secret = envSecret();
  // No env secret outside production: random per-process development key,
  // never a publicly known signing secret.
  return secret ? new TextEncoder().encode(secret) : developmentKey;
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
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER });
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
