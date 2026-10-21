import { defineEventHandler, createError, getMethod, readBody, setResponseHeader } from "h3";
import { assertAuthConfigured, createSessionToken, storageOr503, STORAGE_MESSAGE } from "../../lib/api-helpers.ts";
import { hashPassword, isValidEmail, isValidPassword } from "../../lib/auth.ts";
import { createUser, getUserByEmail } from "../../lib/db.ts";

export default defineEventHandler(async (event) => {
  if (getMethod(event) !== "POST") {
    throw createError({ statusCode: 405, statusMessage: "Method not allowed" });
  }
  // Check config before any DB write: a misconfigured server must not create
  // an account it then cannot sign in (the old 500-after-create trap).
  assertAuthConfigured();

  const body = await readBody<unknown>(event);
  if (!body || typeof body !== "object" || !("email" in body) || !("password" in body)
      || typeof body.email !== "string" || typeof body.password !== "string") {
    throw createError({ statusCode: 400, statusMessage: "Email and password must be strings" });
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: "Email and password required" });
  }
  if (!isValidEmail(email)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid email" });
  }
  if (!isValidPassword(password)) {
    throw createError({ statusCode: 400, statusMessage: "Password must be 8-128 characters" });
  }
  if (await storageOr503("register duplicate check", () => getUserByEmail(email))) {
    throw createError({ statusCode: 409, statusMessage: "Email already registered" });
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await createUser(email, passwordHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account";
    console.error("[auth/register] createUser failed", err);
    throw createError(
      message.toLowerCase().includes("already registered")
        ? { statusCode: 409, statusMessage: "Email already registered" }
        : { statusCode: 503, statusMessage: STORAGE_MESSAGE },
    );
  }
  const token = await createSessionToken(user);

  setResponseHeader(event, "Content-Type", "application/json");
  return { token, user: { id: user.id, email: user.email, createdAt: user.createdAt } };
});
