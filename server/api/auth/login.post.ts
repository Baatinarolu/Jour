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

  const user = await getUserByEmail(email);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage:
        "No account with this email on this server. If it worked before and disappeared, the deployment lost its storage on redeploy — create the account again; your journal on this device is not affected.",
    });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw createError({ statusCode: 401, statusMessage: "Wrong password for this account" });
  }

  const token = await createToken({ sub: user.id, email: user.email });

  setResponseHeader(event, "Content-Type", "application/json");
  return { token, user: { id: user.id, email: user.email, createdAt: user.createdAt } };
});
