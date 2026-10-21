import { test } from "node:test";
import assert from "node:assert/strict";
import { createToken, verifyToken } from "./auth.ts";

test("production rejects missing and short signing secrets; valid secrets round-trip", async () => {
  const old = { node: process.env.NODE_ENV, auth: process.env.AUTH_SECRET, jwt: process.env.JWT_SECRET };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    delete process.env.JWT_SECRET;
    await assert.rejects(createToken({ sub: "test-user", email: "test@example.com" }), /32 characters/);
    process.env.AUTH_SECRET = "too-short";
    await assert.rejects(createToken({ sub: "test-user", email: "test@example.com" }), /32 characters/);
    process.env.AUTH_SECRET = "a".repeat(64);
    const token = await createToken({ sub: "test-user", email: "test@example.com" });
    assert.equal((await verifyToken(token))?.sub, "test-user");
    process.env.AUTH_SECRET = "b".repeat(64);
    assert.equal(await verifyToken(token), null);
  } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: old.node, AUTH_SECRET: old.auth, JWT_SECRET: old.jwt })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
