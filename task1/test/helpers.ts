import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCustomerServer } from "../src/createServer.js";

export async function connectTestClient() {
  const server = createCustomerServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "task1-test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export function expectInvalidParams(result: {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  error?: { code?: number };
}): void {
  if (result.error?.code === -32602) {
    return;
  }
  if (result.isError) {
    const text = (result.content ?? []).map((part) => part.text ?? "").join("\n");
    if (text.includes("-32602") || text.includes("32602") || /invalid/i.test(text)) {
      return;
    }
  }
  throw new Error(`Expected MCP -32602 or tool isError, got ${JSON.stringify(result)}`);
}
