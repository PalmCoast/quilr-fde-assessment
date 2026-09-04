import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCustomerRecord, triggerRefund, ToolValidationError } from "./handlers.js";
import { logError, logInfo } from "./log.js";
import { customerIdSchema } from "./schemas.js";

function asText(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function validationResult(error: ToolValidationError) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          code: error.code,
          message: error.message,
          issues: error.zodIssues,
        }),
      },
    ],
  };
}

/**
 * Official MCP server. Zod schemas are registered with the SDK so invalid
 * arguments never reach business logic. The SDK may return a tool `isError`
 * result instead of a protocol-level -32602; handlers also embed code -32602
 * so clients can assert either shape.
 */
export function createCustomerServer(): McpServer {
  const server = new McpServer({
    name: "quilr-customer-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "get_customer_record",
    {
      title: "Get customer record",
      description: "Look up a billing customer by id. customer_id must match CUST-XXXXX.",
      inputSchema: {
        customer_id: customerIdSchema.describe("Customer id in the form CUST-XXXXX"),
      },
    },
    async (args) => {
      try {
        const result = getCustomerRecord(args);
        logInfo("get_customer_record", { customer_id: args.customer_id, found: result.found });
        return asText(result);
      } catch (error) {
        if (error instanceof ToolValidationError) {
          logError("get_customer_record validation failed", { issues: error.zodIssues });
          return validationResult(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "trigger_refund",
    {
      title: "Trigger refund",
      description: "Issue a refund. amount must be > 0 and reason at least 10 characters.",
      inputSchema: {
        customer_id: customerIdSchema.describe("Customer id in the form CUST-XXXXX"),
        amount: z.number().positive("amount must be greater than 0"),
        reason: z.string().min(10, "reason must be at least 10 characters"),
      },
    },
    async (args) => {
      try {
        const result = triggerRefund(args);
        logInfo("trigger_refund", {
          customer_id: args.customer_id,
          accepted: result.accepted,
        });
        return asText(result);
      } catch (error) {
        if (error instanceof ToolValidationError) {
          logError("trigger_refund validation failed", { issues: error.zodIssues });
          return validationResult(error);
        }
        throw error;
      }
    },
  );

  return server;
}
