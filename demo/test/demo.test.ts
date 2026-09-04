import { afterEach, describe, expect, it } from "vitest";
import { createDemoServer, createDemoState } from "../src/server.js";

const servers: Array<ReturnType<typeof createDemoServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

async function listen() {
  const state = createDemoState();
  const server = createDemoServer(state);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  return { state, base: `http://127.0.0.1:${address.port}` };
}

describe("demo surface", () => {
  it("serves health and the documented demo tokens", async () => {
    const { base } = await listen();
    const response = await fetch(`${base}/health`);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.tokens).toEqual({
      admin: "admin-token",
      viewer: "viewer-token",
      tenant: "tenant-demo",
    });
  });

  it("blocks a viewer admin_* call on the demo gateway", async () => {
    const { base } = await listen();
    const response = await fetch(`${base}/api/task2/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer viewer-token", "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "admin_list_customers", arguments: {} },
      }),
    });
    const body = await response.json();
    expect(body.error).toEqual({ code: -32001, message: "Unauthorized Tool Call" });
  });

  it("redacts PII through the demo stream endpoint", async () => {
    const { base } = await listen();
    const response = await fetch(`${base}/api/task3/redact/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chunks: ["hello jane.doe@", "acme.com"] }),
    });
    expect(await response.text()).toBe("hello [REDACTED]");
  });
});
