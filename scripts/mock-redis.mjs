// In-memory stand-in for an Upstash/Vercel Redis REST endpoint.
// Useful for testing cloud sync locally without provisioning a real store:
//
//   node scripts/mock-redis.mjs 8090
//   KV_REST_API_URL=http://127.0.0.1:8090 KV_REST_API_TOKEN=local npm run preview:restart
//
// Supports the commands this app uses: GET, SET, DEL, SADD, SCARD.
// Data lives in memory only — restarting this process clears it.
import http from "node:http";

const port = Number(process.argv[2] ?? 8090);
const token = process.env.MOCK_REDIS_TOKEN ?? "local";

const strings = new Map();
const sets = new Map();

const server = http.createServer((req, res) => {
  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  if (req.method !== "POST") return send(405, { error: "POST required" });
  if ((req.headers.authorization ?? "") !== `Bearer ${token}`) return send(401, { error: "unauthorized" });

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parts;
    try {
      parts = JSON.parse(body);
    } catch {
      return send(400, { error: "body must be a JSON array" });
    }
    if (!Array.isArray(parts) || parts.length === 0) return send(400, { error: "empty command" });

    const [rawCmd, ...args] = parts.map(String);
    const cmd = rawCmd.toUpperCase();

    switch (cmd) {
      case "GET":
        return send(200, { result: strings.get(args[0]) ?? null });
      case "SET": {
        const [key, value, flag] = args;
        if (flag === "NX" && strings.has(key)) return send(200, { result: null });
        strings.set(key, value);
        return send(200, { result: "OK" });
      }
      case "DEL":
        return send(200, { result: strings.delete(args[0]) ? 1 : 0 });
      case "SADD": {
        const set = sets.get(args[0]) ?? new Set();
        const before = set.size;
        set.add(args[1]);
        sets.set(args[0], set);
        return send(200, { result: set.size - before });
      }
      case "SCARD":
        return send(200, { result: sets.get(args[0])?.size ?? 0 });
      default:
        return send(400, { error: `unknown command ${cmd}` });
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[mock-redis] listening on http://127.0.0.1:${port} (token: ${token})`);
});
