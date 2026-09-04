import http from "node:http";
import { redactComplete, redactStream, StreamingPiiRedactor } from "./redact.js";

const PORT = Number(process.env.TASK3_PORT ?? 43123);

function log(message: string): void {
  process.stderr.write(`[task3] ${message}\n`);
}

export function createTask3Server(): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "task3-pii-guardrail" }));
      return;
    }

    if (req.method === "POST" && req.url === "/redact") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(redactComplete(text));
      return;
    }

    if (req.method === "POST" && req.url === "/redact/stream") {
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
      });
      const redactor = new StreamingPiiRedactor();
      for await (const chunk of req) {
        const safe = redactor.push((chunk as Buffer).toString("utf8"));
        if (safe) {
          res.write(safe);
        }
      }
      const tail = redactor.end();
      if (tail) {
        res.write(tail);
      }
      res.end();
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
}

export { redactStream };

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createTask3Server();
  server.listen(PORT, "127.0.0.1", () => {
    log(`PII guardrail listening on http://127.0.0.1:${PORT}`);
  });
}
