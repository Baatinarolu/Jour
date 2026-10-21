import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const ALG = "HS256";
const ISSUER = "santandc";
const EXPIRY = "30d";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return new TextEncoder().encode(secret);
  // Dev fallback — stable per-container but warns in logs. On Vercel, set AUTH_SECRET env.
  const fallback = "dev-only-santandc-secret-change-me-in-prod-32chars";
  if (process.env.NODE_ENV === "production" && !secret) {
    console.warn("[auth] AUTH_SECRET not set — using insecure dev fallback. Set AUTH_SECRET env in production.");
  }
  return new TextEncoder().encode(fallback);
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
