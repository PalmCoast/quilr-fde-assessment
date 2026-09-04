import http from "node:http";
import { createLocalDownstream } from "./downstream.js";
import { proxyMcpRequest } from "./gateway.js";
import type { JsonRpcRequest } from "./types.js";

const PORT = Number(process.env.TASK2_PORT ?? 43122);
const downstream = createLocalDownstream();

function log(message: string): void {
  process.stderr.write(`[task2] ${message}\n`);
}

export function createTask2Server(): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "task2-gateway" }));
      return;
    }

    if (req.method !== "POST" || (req.url !== "/mcp" && req.url !== "/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRpcRequest;
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      return;
    }

    const result = await proxyMcpRequest({
      authorizationHeader: req.headers.authorization,
      request,
      downstream,
    });

    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createTask2Server();
  server.listen(PORT, "127.0.0.1", () => {
    log(`MCP security gateway listening on http://127.0.0.1:${PORT}/mcp`);
  });
}
