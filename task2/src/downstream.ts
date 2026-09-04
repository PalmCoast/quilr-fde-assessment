import { getCustomerRecord, listCustomers, listRefunds, triggerRefund } from "@quilr/task1";
import type { DownstreamHandler, JsonRpcRequest, JsonRpcResponse } from "./types.js";

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const TOOLS: Tool[] = [
  {
    name: "get_customer_record",
    description: "Look up a billing customer by id.",
    inputSchema: {
      type: "object",
      required: ["customer_id"],
      properties: { customer_id: { type: "string" } },
    },
  },
  {
    name: "trigger_refund",
    description: "Issue a refund for a customer.",
    inputSchema: {
      type: "object",
      required: ["customer_id", "amount", "reason"],
      properties: {
        customer_id: { type: "string" },
        amount: { type: "number" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "admin_list_customers",
    description: "Admin-only full customer export.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "admin_list_refunds",
    description: "Admin-only refund ledger.",
    inputSchema: { type: "object", properties: {} },
  },
];

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export function createLocalDownstream(options?: { onCall?: (name: string) => void }): DownstreamHandler {
  return {
    async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
      if (request.method === "tools/list") {
        return ok(request.id, { tools: TOOLS });
      }
      if (request.method !== "tools/call") {
        return fail(request.id, -32601, "Method not found");
      }

      const name = typeof request.params?.name === "string" ? request.params.name : "";
      const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
      options?.onCall?.(name);

      try {
        if (name === "get_customer_record") {
          return ok(request.id, getCustomerRecord(args));
        }
        if (name === "trigger_refund") {
          return ok(request.id, triggerRefund(args));
        }
        if (name === "admin_list_customers") {
          return ok(request.id, { customers: listCustomers() });
        }
        if (name === "admin_list_refunds") {
          return ok(request.id, { refunds: listRefunds() });
        }
        return fail(request.id, -32601, `Unknown tool: ${name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid params";
        return fail(request.id, -32602, message);
      }
    },
  };
}

export function createRecordingDownstream(): DownstreamHandler & { calls: JsonRpcRequest[] } {
  const calls: JsonRpcRequest[] = [];
  const inner = createLocalDownstream({
    onCall: () => {
      /* recorded below */
    },
  });
  return {
    calls,
    async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
      calls.push(request);
      return inner.handle(request);
    },
  };
}
