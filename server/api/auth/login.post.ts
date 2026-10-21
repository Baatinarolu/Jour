import { defineEventHandler, createError, getMethod, readBody, setResponseHeader } from "h3";
import { verifyPassword, createToken, isValidEmail } from "../../lib/auth.ts";
import { getUserByEmail } from "../../lib/db.ts";

export default defineEventHandler(async (event) => {
  if (getMethod(event) !== "POST") {
    throw createError({ statusCode: 405, statusMessage: "Method not allowed" });
  }

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

  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw createError({ statusCode: 401, statusMessage: "Invalid email or password" });
  }

  const token = await createToken({ sub: user.id, email: user.email });

  setResponseHeader(event, "Content-Type", "application/json");
  return { token, user: { id: user.id, email: user.email, createdAt: user.createdAt } };
});
