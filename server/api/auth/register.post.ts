import { defineEventHandler, createError, getMethod, readBody, setResponseHeader } from "h3";
import { hashPassword, createToken, isValidEmail, isValidPassword } from "../../lib/auth.ts";
import { createUser, getUserByEmail } from "../../lib/db.ts";

export default defineEventHandler(async (event) => {
  if (getMethod(event) !== "POST") {
    throw createError({ statusCode: 405, statusMessage: "Method not allowed" });
  }

  const body = await readBody<{ email?: string; password?: string }>(event);
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: "Email and password required" });
  }
  if (!isValidEmail(email)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid email" });
  }
  if (!isValidPassword(password)) {
    throw createError({ statusCode: 400, statusMessage: "Password must be 8-128 characters" });
  }
  if (await getUserByEmail(email)) {
    throw createError({ statusCode: 409, statusMessage: "Email already registered" });
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await createUser(email, passwordHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account";
    console.error("[auth/register] createUser failed", err);
    throw createError({
      statusCode: message.toLowerCase().includes("already registered") ? 409 : 500,
      statusMessage: message.toLowerCase().includes("already registered")
        ? "Email already registered"
        : `Could not create account: ${message}`,
    });
  }
  const token = await createToken({ sub: user.id, email: user.email });

  setResponseHeader(event, "Content-Type", "application/json");
  return { token, user: { id: user.id, email: user.email, createdAt: user.createdAt } };
});
