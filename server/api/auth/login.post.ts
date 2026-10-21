import { defineEventHandler, createError, getMethod, readBody, setResponseHeader } from "h3";
import { verifyPassword, createToken, isValidEmail } from "../../lib/auth.ts";
import { getUserByEmail } from "../../lib/db.ts";

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

  const user = getUserByEmail(email);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Invalid email or password" });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: "Invalid email or password" });
  }

  const token = await createToken({ sub: user.id, email: user.email });

  setResponseHeader(event, "Content-Type", "application/json");
  return { token, user: { id: user.id, email: user.email, createdAt: user.createdAt } };
});
