import { defineEventHandler, createError, getHeader, setResponseHeader } from "h3";
import { verifyToken, extractBearerToken } from "../lib/auth.ts";
import { getJournal, getUserById } from "../lib/db.ts";

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, "authorization");
  const token = extractBearerToken(auth);
  if (!token) throw createError({ statusCode: 401, statusMessage: "Missing token" });

  const payload = await verifyToken(token);
  if (!payload) throw createError({ statusCode: 401, statusMessage: "Invalid token" });

  const user = getUserById(payload.sub);
  if (!user) throw createError({ statusCode: 401, statusMessage: "User not found" });

  const record = getJournal(user.id);
  setResponseHeader(event, "Content-Type", "application/json");
  if (!record) {
    return { backup: null, updatedAt: null, version: 0 };
  }
  return { backup: record.backup, updatedAt: record.updatedAt, version: record.version };
});
