import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCustomerRecord, triggerRefund, ToolValidationError } from "@quilr/task1";
import { createLocalDownstream, proxyMcpRequest, type JsonRpcRequest } from "@quilr/task2";
import { StreamingPiiRedactor, redactComplete } from "@quilr/task3";
import {
  ERROR_CODES,
  errorEnvelope,
  httpStatusFor,
  ModelRouter,
  TokenLimiter,
  createMockUpstream,
} from "@quilr/task4";

const PORT = Number(process.env.DEMO_PORT ?? 43121);
const HOST = "127.0.0.1";
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function log(message: string): void {
  process.stderr.write(`[demo] ${message}\n`);
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function tenantFrom(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return match?.[1] ?? null;
}

export function createDemoState() {
  const downstream = createLocalDownstream();
  const limiter = new TokenLimiter({ limitPerMinute: 50_000 });
  let primaryBehavior: "ok" | "429" | "timeout" | "error" = "ok";

  function router(): ModelRouter {
    return new ModelRouter({
      limiter,
      primary: createMockUpstream({ name: "primary", behavior: primaryBehavior }),
      secondary: createMockUpstream({ name: "secondary", behavior: "ok" }),
      timeoutMs: primaryBehavior === "timeout" ? 40 : 3_000,
    });
  }

  return {
    downstream,
    limiter,
    get primaryBehavior() {
      return primaryBehavior;
    },
    setPrimaryBehavior(next: typeof primaryBehavior) {
      primaryBehavior = next;
    },
    router,
  };
}

export function createDemoServer(state = createDemoState()): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, {
          ok: true,
          service: "quilr-fde-demo",
          port: PORT,
          tokens: {
            admin: "admin-token",
            viewer: "viewer-token",
            tenant: "tenant-demo",
          },
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task1/call") {
        const body = JSON.parse((await readBody(req)) || "{}") as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        try {
          if (body.name === "get_customer_record") {
            json(res, 200, getCustomerRecord(body.arguments ?? {}));
            return;
          }
          if (body.name === "trigger_refund") {
            json(res, 200, triggerRefund(body.arguments ?? {}));
            return;
          }
          json(res, 400, { error: { code: -32601, message: "Unknown tool" } });
        } catch (error) {
          if (error instanceof ToolValidationError) {
            json(res, 400, { error: { code: error.code, message: error.message, issues: error.zodIssues } });
            return;
          }
          throw error;
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task2/mcp") {
        const request = JSON.parse((await readBody(req)) || "{}") as JsonRpcRequest;
        const result = await proxyMcpRequest({
          authorizationHeader: req.headers.authorization,
          request,
          downstream: state.downstream,
        });
        json(res, result.status, result.body);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task3/redact") {
        const text = await readBody(req);
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(redactComplete(text));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task3/redact/stream") {
        res.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-cache",
          "x-accel-buffering": "no",
        });
        const incoming = await readBody(req);
        const payload = (() => {
          try {
            return JSON.parse(incoming) as { text?: string; chunks?: string[] };
          } catch {
            return { text: incoming };
          }
        })();
        const chunks = payload.chunks ?? chunkText(payload.text ?? "");
        const redactor = new StreamingPiiRedactor();
        for (const chunk of chunks) {
          const safe = redactor.push(chunk);
          if (safe) res.write(safe);
        }
        const tail = redactor.end();
        if (tail) res.write(tail);
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task4/simulate") {
        const body = JSON.parse((await readBody(req)) || "{}") as { primary?: string };
        const next = body.primary;
        if (next !== "ok" && next !== "429" && next !== "timeout" && next !== "error") {
          json(res, 400, errorEnvelope(ERROR_CODES.BAD_REQUEST));
          return;
        }
        state.setPrimaryBehavior(next);
        json(res, 200, { primary: state.primaryBehavior });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/task4/chat") {
        const tenant = tenantFrom(req.headers.authorization);
        if (!tenant) {
          json(res, httpStatusFor(ERROR_CODES.UNAUTHORIZED), errorEnvelope(ERROR_CODES.UNAUTHORIZED));
          return;
        }
        const body = JSON.parse((await readBody(req)) || "{}") as Record<string, unknown>;
        const result = await state.router().complete(tenant, body);
        json(res, result.status, result.body);
        return;
      }

      if (req.method === "GET") {
        const filePath = resolvePublic(url.pathname);
        if (filePath) {
          const ext = path.extname(filePath);
          res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
          res.end(fs.readFileSync(filePath));
          return;
        }
      }

      json(res, 404, { error: "not found" });
    } catch {
      json(res, 500, errorEnvelope(ERROR_CODES.UPSTREAM_UNAVAILABLE, "Demo request failed."));
    }
  });
}

function resolvePublic(pathname: string): string | null {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, relative);
  if (!resolved.startsWith(publicDir)) {
    return null;
  }
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

function chunkText(text: string): string[] {
  if (!text) return [""];
  const chunks: string[] = [];
  const size = 11;
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createDemoServer();
  server.listen(PORT, HOST, () => {
    log(`demo available at http://${HOST}:${PORT}`);
  });
}
