import { afterEach, describe, expect, it } from "vitest";
import { parseGetCustomerRecord, parseTriggerRefund, ToolValidationError } from "../src/handlers.js";
import { resetStore } from "../src/store.js";
import { connectTestClient, expectInvalidParams } from "./helpers.js";

afterEach(() => {
  resetStore();
});

describe("task1 customer MCP server", () => {
  it("lists get_customer_record and trigger_refund", async () => {
    const { client, close } = await connectTestClient();
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "get_customer_record",
      "trigger_refund",
    ]);
    await close();
  });

  it("returns a customer record for a valid CUST-XXXXX id", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "get_customer_record",
      arguments: { customer_id: "CUST-10001" },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(String(result.content[0].text));
    expect(payload.found).toBe(true);
    expect(payload.customer.name).toBe("Northwind Analytics");
    await close();
  });

  it("reports not found for a well-formed unknown customer", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "get_customer_record",
      arguments: { customer_id: "CUST-99999" },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(String(result.content[0].text));
    expect(payload).toEqual({ found: false, customer_id: "CUST-99999" });
    await close();
  });

  it("rejects a malformed customer_id as -32602 or tool isError", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "get_customer_record",
      arguments: { customer_id: "cust-1" },
    });
    expectInvalidParams(result);
    await close();
  });

  it("rejects a missing customer_id as -32602 or tool isError", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "get_customer_record",
      arguments: {},
    });
    expectInvalidParams(result);
    await close();
  });

  it("accepts a valid refund", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "trigger_refund",
      arguments: {
        customer_id: "CUST-10002",
        amount: 25.5,
        reason: "Duplicate charge on last invoice",
      },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(String(result.content[0].text));
    expect(payload.accepted).toBe(true);
    expect(payload.refund.amount).toBe(25.5);
    await close();
  });

  it("rejects amount <= 0 as -32602 or tool isError", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "trigger_refund",
      arguments: {
        customer_id: "CUST-10001",
        amount: 0,
        reason: "Customer asked for a courtesy refund",
      },
    });
    expectInvalidParams(result);
    await close();
  });

  it("rejects a short refund reason as -32602 or tool isError", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "trigger_refund",
      arguments: {
        customer_id: "CUST-10001",
        amount: 10,
        reason: "too short",
      },
    });
    expectInvalidParams(result);
    await close();
  });

  it("does not create a refund when the customer id format is invalid", async () => {
    const { client, close } = await connectTestClient();
    const result = await client.callTool({
      name: "trigger_refund",
      arguments: {
        customer_id: "CUST-12",
        amount: 10,
        reason: "Valid looking reason text",
      },
    });
    expectInvalidParams(result);
    await close();
  });

  it("surfaces Zod issues with code -32602 from the parser", () => {
    try {
      parseGetCustomerRecord({ customer_id: "nope" });
      throw new Error("expected parse to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolValidationError);
      expect((error as ToolValidationError).code).toBe(-32602);
    }

    try {
      parseTriggerRefund({
        customer_id: "CUST-10001",
        amount: -5,
        reason: "short",
      });
      throw new Error("expected parse to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolValidationError);
      expect((error as ToolValidationError).code).toBe(-32602);
    }
  });
});
