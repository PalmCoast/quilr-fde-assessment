import { createRefund, getCustomer } from "./store.js";
import { getCustomerRecordInputSchema, triggerRefundInputSchema } from "./schemas.js";

export class ToolValidationError extends Error {
  readonly code = -32602;
  readonly zodIssues: string[];

  constructor(zodIssues: string[]) {
    super(`Invalid params: ${zodIssues.join("; ")}`);
    this.name = "ToolValidationError";
    this.zodIssues = zodIssues;
  }
}

function issuesFromZod(error: { issues: Array<{ path: Array<string | number>; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "input";
    return `${path}: ${issue.message}`;
  });
}

export function parseGetCustomerRecord(args: unknown): { customer_id: string } {
  const parsed = getCustomerRecordInputSchema.safeParse(args);
  if (!parsed.success) {
    throw new ToolValidationError(issuesFromZod(parsed.error));
  }
  return parsed.data;
}

export function parseTriggerRefund(args: unknown): {
  customer_id: string;
  amount: number;
  reason: string;
} {
  const parsed = triggerRefundInputSchema.safeParse(args);
  if (!parsed.success) {
    throw new ToolValidationError(issuesFromZod(parsed.error));
  }
  return parsed.data;
}

export function getCustomerRecord(args: unknown) {
  const { customer_id } = parseGetCustomerRecord(args);
  const customer = getCustomer(customer_id);
  if (!customer) {
    return { found: false as const, customer_id };
  }
  return { found: true as const, customer };
}

export function triggerRefund(args: unknown) {
  const input = parseTriggerRefund(args);
  const customer = getCustomer(input.customer_id);
  if (!customer) {
    return { accepted: false as const, customer_id: input.customer_id, reason: "customer_not_found" };
  }
  return { accepted: true as const, refund: createRefund(input) };
}
