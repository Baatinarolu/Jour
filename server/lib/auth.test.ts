import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AuthConfigError,
  createToken,
  getAuthConfigError,
  getAuthReadiness,
  hasEnvSecret,
  setManagedSecretLoaderForTests,
  verifyToken,
} from "./auth.ts";

function restoreEnv(old: { node?: string; auth?: string; jwt?: string }) {
  for (const [key, value] of Object.entries({ NODE_ENV: old.node, AUTH_SECRET: old.auth, JWT_SECRET: old.jwt })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

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
    restoreEnv(old);
  }
});

test("getAuthConfigError distinguishes missing, short, placeholder and valid secrets", async () => {
  const old = { node: process.env.NODE_ENV, auth: process.env.AUTH_SECRET, jwt: process.env.JWT_SECRET };
  try {
    delete process.env.AUTH_SECRET;
    delete process.env.JWT_SECRET;

    // Development without a secret is usable (ephemeral per-process key).
    process.env.NODE_ENV = "development";
    assert.equal(getAuthConfigError(), null);
    assert.equal(hasEnvSecret(), false);

    // Production without an env secret: the env config itself is not an
    // error (a managed DB secret may cover it), but with no durable storage
    // available — as in this test process — readiness must report the
    // problem upfront instead of exploding as an unhandled 500 in a handler.
    process.env.NODE_ENV = "production";
    assert.equal(getAuthConfigError(), null);
    const readiness = await getAuthReadiness();
    assert.equal(readiness.ready, false);
    assert.match(readiness.problem ?? "", /AUTH_SECRET is not set/);
    await assert.rejects(
      createToken({ sub: "test-user", email: "test@example.com" }),
      (err: unknown) => err instanceof AuthConfigError,
    );

    process.env.AUTH_SECRET = "too-short";
    assert.match(getAuthConfigError() ?? "", /at least 32 characters/);
    assert.equal(hasEnvSecret(), false);

    // The public .env.example placeholder is long enough but publicly known.
    process.env.AUTH_SECRET = "change-me-to-a-long-random-string-at-least-32-chars";
    assert.match(getAuthConfigError() ?? "", /placeholder/);
    assert.equal(hasEnvSecret(), false);

    process.env.AUTH_SECRET = "c".repeat(64);
    assert.equal(getAuthConfigError(), null);
    assert.equal(hasEnvSecret(), true);
  } finally {
    restoreEnv(old);
  }
});

test("managed secret: production without AUTH_SECRET signs tokens via durable storage", async () => {
  const old = { node: process.env.NODE_ENV, auth: process.env.AUTH_SECRET, jwt: process.env.JWT_SECRET };
  // In-memory stand-in for the Postgres/Redis get-or-create: first candidate wins.
  const stored: { value: string | null } = { value: null };
  let loaderCalls = 0;
  setManagedSecretLoaderForTests(async (candidate) => {
    loaderCalls += 1;
    return (stored.value ??= candidate);
  });
  try {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    delete process.env.JWT_SECRET;

    const readiness = await getAuthReadiness();
    assert.deepEqual(readiness, { ready: true, source: "managed", problem: null });
    assert.ok((stored.value ?? "").length >= 32, "a strong secret was generated and stored");

    const token = await createToken({ sub: "managed-user", email: "m@example.com" });
    assert.equal((await verifyToken(token))?.sub, "managed-user");
    assert.equal(loaderCalls, 1, "managed key is loaded once and cached per process");

    // A different stored secret (e.g. different database) rejects old tokens.
    setManagedSecretLoaderForTests(async () => "d".repeat(64));
    assert.equal(await verifyToken(token), null);

    // An explicitly set but invalid env secret still fails loudly — the
    // managed fallback never silently overrides operator intent.
    process.env.AUTH_SECRET = "too-short";
    assert.equal((await getAuthReadiness()).ready, false);
    await assert.rejects(
      createToken({ sub: "x", email: "x@example.com" }),
      (err: unknown) => err instanceof AuthConfigError,
    );
  } finally {
    setManagedSecretLoaderForTests(null);
    restoreEnv(old);
  }
});
