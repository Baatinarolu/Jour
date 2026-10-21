import { defineEventHandler, createError, getHeader, setResponseHeader } from "h3";
import { verifyToken, extractBearerToken } from "../../lib/auth.ts";
import { getUserById } from "../../lib/db.ts";

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, "authorization");
  const token = extractBearerToken(auth);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Missing token" });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    throw createError({ statusCode: 401, statusMessage: "Invalid or expired token" });
  }

  const user = getUserById(payload.sub);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "User not found" });
  }

  setResponseHeader(event, "Content-Type", "application/json");
  return { user: { id: user.id, email: user.email, createdAt: user.createdAt } };
});
