import { z } from "zod";

export const CUSTOMER_ID_PATTERN = /^CUST-\d{5}$/;

export const customerIdSchema = z
  .string()
  .regex(CUSTOMER_ID_PATTERN, "customer_id must match CUST-XXXXX");

export const getCustomerRecordInputSchema = z.object({
  customer_id: customerIdSchema,
});

export const triggerRefundInputSchema = z.object({
  customer_id: customerIdSchema,
  amount: z.number().positive("amount must be greater than 0"),
  reason: z.string().min(10, "reason must be at least 10 characters"),
});

export type GetCustomerRecordInput = z.infer<typeof getCustomerRecordInputSchema>;
export type TriggerRefundInput = z.infer<typeof triggerRefundInputSchema>;
