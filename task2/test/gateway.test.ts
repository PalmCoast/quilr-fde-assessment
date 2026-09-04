import { describe, expect, it } from "vitest";
import { ADMIN_TOKEN, VIEWER_TOKEN, authenticate } from "../src/auth.js";
import { createRecordingDownstream } from "../src/downstream.js";
import { UNAUTHORIZED_TOOL_CALL, proxyMcpRequest } from "../src/gateway.js";
import type { JsonRpcRequest } from "../src/types.js";

function rpc(method: string, params?: Record<string, unknown>, id: number = 1): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method, params };
}

describe("task2 auth", () => {
  it("treats Bearer admin-token as admin", () => {
    expect(authenticate("Bearer admin-token")).toEqual({ role: "admin", token: ADMIN_TOKEN });
  });

  it("treats any other Bearer token as viewer", () => {
    expect(authenticate("Bearer viewer-token")).toEqual({ role: "viewer", token: VIEWER_TOKEN });
    expect(authenticate("Bearer totally-random")).toEqual({ role: "viewer", token: "totally-random" });
  });

  it("rejects a missing or malformed Authorization header", () => {
    expect(authenticate(undefined)).toBeNull();
    expect(authenticate("Basic admin-token")).toBeNull();
    expect(authenticate("Bearer")).toBeNull();
  });
});

describe("task2 MCP security gateway", () => {
  it("forwards tools/list including admin_* names to viewers", async () => {
    const downstream = createRecordingDownstream();
    const result = await proxyMcpRequest({
      authorizationHeader: "Bearer viewer-token",
      request: rpc("tools/list"),
      downstream,
    });
    expect(result.ok).toBe(true);
    expect(downstream.calls).toHaveLength(1);
    const tools = (result.body as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "get_customer_record",
        "trigger_refund",
        "admin_list_customers",
        "admin_list_refunds",
      ]),
    );
  });

  it("forwards tools/list including admin_* names to admins", async () => {
    const downstream = createRecordingDownstream();
    const result = await proxyMcpRequest({
      authorizationHeader: "Bearer admin-token",
      request: rpc("tools/list"),
      downstream,
    });
    expect(result.ok).toBe(true);
    const tools = (result.body as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.some((tool) => tool.name.startsWith("admin_"))).toBe(true);
  });

  it("lets an admin call an admin_* tool", async () => {
    const downstream = createRecordingDownstream();
    const result = await proxyMcpRequest({
      authorizationHeader: "Bearer admin-token",
      request: rpc("tools/call", { name: "admin_list_customers", arguments: {} }),
      downstream,
    });
    expect(result.ok).toBe(true);
    expect(downstream.calls).toHaveLength(1);
    expect((result.body as { result: { customers: unknown[] } }).result.customers.length).toBeGreaterThan(0);
  });

  it("returns JSON-RPC -32001 for a non-admin admin_* tools/call", async () => {
    const downstream = createRecordingDownstream();
    const result = await proxyMcpRequest({
      authorizationHeader: "Bearer viewer-token",
      request: rpc("tools/call", { name: "admin_list_refunds", arguments: {} }, 42),
      downstream,
    });
    expect(result.ok).toBe(false);
    expect(result.body).toEqual({
      jsonrpc: "2.0",
      id: 42,
      error: { code: UNAUTHORIZED_TOOL_CALL.code, message: UNAUTHORIZED_TOOL_CALL.message },
    });
  });

  it("does not hit downstream when a viewer calls an admin_* tool", async () => {
    const downstream = createRecordingDownstream();
    await proxyMcpRequest({
      authorizationHeader: "Bearer other-bearer",
      request: rpc("tools/call", { name: "admin_list_customers", arguments: {} }),
      downstream,
    });
    expect(downstream.calls).toEqual([]);
  });

  it("lets a viewer call a non-admin tool", async () => {
    const downstream = createRecordingDownstream();
    const result = await proxyMcpRequest({
      authorizationHeader: "Bearer viewer-token",
      request: rpc("tools/call", { name: "get_customer_record", arguments: { customer_id: "CUST-10001" } }),
      downstream,
    });
    expect(result.ok).toBe(true);
    expect(downstream.calls).toHaveLength(1);
    expect((result.body as { result: { found: boolean } }).result.found).toBe(true);
  });

  it("rejects requests without a Bearer token before touching downstream", async () => {
    const downstream = createRecordingDownstream();
    const result = await proxyMcpRequest({
      authorizationHeader: undefined,
      request: rpc("tools/list"),
      downstream,
    });
    expect(result.status).toBe(401);
    expect(downstream.calls).toEqual([]);
  });
});
