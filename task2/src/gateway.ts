import { authenticate, isAdminTool } from "./auth.js";
import type { AuthContext, DownstreamHandler, JsonRpcRequest, JsonRpcResponse } from "./types.js";

export const UNAUTHORIZED_TOOL_CALL = {
  code: -32001,
  message: "Unauthorized Tool Call",
} as const;

export type GatewayResult =
  | { ok: true; status: number; body: JsonRpcResponse }
  | { ok: false; status: number; body: JsonRpcResponse };

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export function authorize(authorizationHeader: string | undefined): AuthContext | null {
  return authenticate(authorizationHeader);
}

export async function proxyMcpRequest(options: {
  authorizationHeader: string | undefined;
  request: JsonRpcRequest;
  downstream: DownstreamHandler;
}): Promise<GatewayResult> {
  const auth = authorize(options.authorizationHeader);
  if (!auth) {
    return {
      ok: false,
      status: 401,
      body: jsonRpcError(options.request.id, -32000, "Missing or invalid Bearer token"),
    };
  }

  if (!options.request || options.request.jsonrpc !== "2.0" || !options.request.method) {
    return {
      ok: false,
      status: 400,
      body: jsonRpcError(options.request?.id, -32600, "Invalid Request"),
    };
  }

  if (options.request.method === "tools/call") {
    const toolName =
      typeof options.request.params?.name === "string" ? options.request.params.name : undefined;
    if (isAdminTool(toolName) && auth.role !== "admin") {
      return {
        ok: false,
        status: 403,
        body: jsonRpcError(options.request.id, UNAUTHORIZED_TOOL_CALL.code, UNAUTHORIZED_TOOL_CALL.message),
      };
    }
  }

  const body = await options.downstream.handle(options.request);
  return { ok: true, status: 200, body };
}
