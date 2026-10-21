// Minimal Upstash/Vercel Redis REST client.
// No SDK dependency: works with both Vercel KV ("KV_REST_API_*") and
// Upstash Marketplace ("UPSTASH_REDIS_REST_*") env var names.
//
// All journal data is stored as JSON strings. Large journals are split into
// chunks because Upstash has a request-size limit (~1 MB on the free tier).

export type RedisConfig = { url: string; token: string };

let warned = false;

export function redisConfig(): RedisConfig | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export async function redisCommand(cfg: RedisConfig, parts: (string | number)[]): Promise<unknown> {
  // Commands go in the POST body, not the URL: journal chunks are hundreds of
  // kilobytes and would blow the HTTP header limit if placed in the path.
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parts.map((p) => String(p))),
    // Redis writes must never be served from a cache layer.
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Redis ${parts[0]} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`Redis ${parts[0]} error: ${data.error}`);
  return data.result ?? null;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  const raw = await redisCommand(cfg, ["GET", key]);
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  const cfg = redisConfig();
  if (!cfg) return;
  await redisCommand(cfg, ["SET", key, JSON.stringify(value)]);
}

export async function delKey(key: string): Promise<void> {
  const cfg = redisConfig();
  if (!cfg) return;
  try {
    await redisCommand(cfg, ["DEL", key]);
  } catch {
    /* best effort */
  }
}

// ── Chunked values (for journals with screenshots) ──

const CHUNK_CHARS = 400_000; // ~400 KB of JSON text per request, safely under limits

export async function setChunkedJson(key: string, value: unknown): Promise<void> {
  const cfg = redisConfig();
  if (!cfg) return;
  const json = JSON.stringify(value);
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK_CHARS) chunks.push(json.slice(i, i + CHUNK_CHARS));

  // Write chunks first, then the manifest — a crash mid-write leaves the old
  // manifest intact instead of pointing at half-written data.
  await Promise.all(chunks.map((chunk, i) => redisCommand(cfg, ["SET", `${key}:c${i}`, chunk])));
  await redisCommand(cfg, ["SET", `${key}:meta`, JSON.stringify({ chunks: chunks.length, bytes: json.length })]);
}

export async function getChunkedJson<T>(key: string): Promise<T | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  const meta = await getJson<{ chunks?: number }>(`${key}:meta`);
  if (!meta || typeof meta.chunks !== "number" || meta.chunks <= 0) {
    // Legacy single-value format
    return getJson<T>(key);
  }
  const parts = await Promise.all(
    Array.from({ length: meta.chunks }, (_, i) => redisCommand(cfg, ["GET", `${key}:c${i}`])),
  );
  if (parts.some((p) => typeof p !== "string")) {
    if (!warned) {
      warned = true;
      console.warn("[redis] chunked value is incomplete", key);
    }
    return null;
  }
  try {
    return JSON.parse(parts.join("")) as T;
  } catch {
    return null;
  }
}
