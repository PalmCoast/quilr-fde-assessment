import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const task1Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeMessage(child: ReturnType<typeof spawn>, message: unknown): void {
  child.stdin?.write(`${JSON.stringify(message)}\n`);
}

async function collectJsonRpc(child: ReturnType<typeof spawn>, count: number, timeoutMs = 8000): Promise<unknown[]> {
  const frames: unknown[] = [];
  let buffer = "";

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${count} JSON-RPC frames. stdout=${buffer}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        frames.push(JSON.parse(trimmed));
        if (frames.length >= count) {
          clearTimeout(timer);
          resolve(frames);
        }
      }
    });
  });
}

describe("task1 stdio transport", () => {
  it("writes only JSON-RPC on stdout and logs on stderr", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
      cwd: task1Root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const stderrChunks: string[] = [];
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString("utf8"));
    });

    try {
      writeMessage(child, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "stdio-test", version: "1.0.0" },
        },
      });

      const [initialize] = (await collectJsonRpc(child, 1)) as Array<{
        jsonrpc: string;
        id: number;
        result?: { serverInfo?: { name: string } };
      }>;
      expect(initialize.jsonrpc).toBe("2.0");
      expect(initialize.id).toBe(1);
      expect(initialize.result?.serverInfo?.name).toBe("quilr-customer-mcp");

      writeMessage(child, { jsonrpc: "2.0", method: "notifications/initialized" });
      writeMessage(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

      const [listed] = (await collectJsonRpc(child, 1)) as Array<{
        result?: { tools?: Array<{ name: string }> };
      }>;
      expect(listed.result?.tools?.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["get_customer_record", "trigger_refund"]),
      );

      const stderr = stderrChunks.join("");
      expect(stderr).toMatch(/\[task1]/);
      expect(stderr).not.toMatch(/^\s*\{"jsonrpc":/m);
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
  });
});
