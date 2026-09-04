import http from "node:http";
import { ERROR_CODES, errorEnvelope, httpStatusFor } from "./errors.js";
import { TokenLimiter } from "./limiter.js";
import { ModelRouter } from "./router.js";
import { createMockUpstream } from "./upstream.js";

const PORT = Number(process.env.TASK4_PORT ?? 43124);
const DEMO_TENANT = "tenant-demo";

function log(message: string): void {
  process.stderr.write(`[task4] ${message}\n`);
}

function tenantFrom(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return match?.[1] ?? null;
}

export function createTask4Router(options?: {
  primaryBehavior?: "ok" | "429" | "timeout" | "error";
  secondaryBehavior?: "ok" | "429" | "timeout" | "error";
  timeoutMs?: number;
  dbPath?: string;
  limitPerMinute?: number;
}): ModelRouter {
  return new ModelRouter({
    limiter: new TokenLimiter({
      dbPath: options?.dbPath ?? process.env.TASK4_DB ?? ":memory:",
      limitPerMinute: options?.limitPerMinute,
    }),
    primary: createMockUpstream({
      name: "primary",
      behavior: options?.primaryBehavior ?? (process.env.TASK4_PRIMARY as "ok" | "429" | "timeout" | undefined) ?? "ok",
    }),
    secondary: createMockUpstream({
      name: "secondary",
      behavior: options?.secondaryBehavior ?? "ok",
    }),
    timeoutMs: options?.timeoutMs,
  });
}

export function createTask4Server(router = createTask4Router()): http.Server {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "task4-router", demo_tenant: DEMO_TENANT }));
        return;
      }

      if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify(errorEnvelope(ERROR_CODES.BAD_REQUEST, "Not found.")));
        return;
      }

      const tenant = tenantFrom(req.headers.authorization);
      if (!tenant) {
        res.writeHead(httpStatusFor(ERROR_CODES.UNAUTHORIZED), { "content-type": "application/json" });
        res.end(JSON.stringify(errorEnvelope(ERROR_CODES.UNAUTHORIZED)));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }

      let body: Record<string, unknown>;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
      } catch {
        res.writeHead(httpStatusFor(ERROR_CODES.BAD_REQUEST), { "content-type": "application/json" });
        res.end(JSON.stringify(errorEnvelope(ERROR_CODES.BAD_REQUEST)));
        return;
      }

      const result = await router.complete(tenant, body);
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body));
    } catch {
      res.writeHead(httpStatusFor(ERROR_CODES.UPSTREAM_UNAVAILABLE), { "content-type": "application/json" });
      res.end(JSON.stringify(errorEnvelope(ERROR_CODES.UPSTREAM_UNAVAILABLE)));
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createTask4Server();
  server.listen(PORT, "127.0.0.1", () => {
    log(`model router listening on http://127.0.0.1:${PORT}/v1/chat/completions`);
  });
}
