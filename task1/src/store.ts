export type CustomerRecord = {
  customer_id: string;
  name: string;
  plan: "starter" | "growth" | "enterprise";
  status: "active" | "past_due";
  balance_cents: number;
};

export type RefundRecord = {
  refund_id: string;
  customer_id: string;
  amount: number;
  reason: string;
  status: "accepted";
  created_at: string;
};

const CUSTOMERS: Record<string, CustomerRecord> = {
  "CUST-10001": {
    customer_id: "CUST-10001",
    name: "Northwind Analytics",
    plan: "growth",
    status: "active",
    balance_cents: 18450,
  },
  "CUST-10002": {
    customer_id: "CUST-10002",
    name: "Harbor Clinic",
    plan: "enterprise",
    status: "active",
    balance_cents: 90200,
  },
  "CUST-10003": {
    customer_id: "CUST-10003",
    name: "Pine Street Coffee",
    plan: "starter",
    status: "past_due",
    balance_cents: 2400,
  },
};

const refunds: RefundRecord[] = [];
let refundSeq = 1;

export function getCustomer(customerId: string): CustomerRecord | undefined {
  return CUSTOMERS[customerId];
}

export function listCustomers(): CustomerRecord[] {
  return Object.values(CUSTOMERS);
}

export function createRefund(input: {
  customer_id: string;
  amount: number;
  reason: string;
}): RefundRecord {
  const record: RefundRecord = {
    refund_id: `RFD-${String(refundSeq++).padStart(5, "0")}`,
    customer_id: input.customer_id,
    amount: input.amount,
    reason: input.reason,
    status: "accepted",
    created_at: new Date().toISOString(),
  };
  refunds.push(record);
  return record;
}

export function listRefunds(): RefundRecord[] {
  return [...refunds];
}

export function resetStore(): void {
  refunds.length = 0;
  refundSeq = 1;
}
