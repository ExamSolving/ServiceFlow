import { z } from "zod";

import { isMoney } from "@/src/lib/billing/money";
import { billingIdSchema, billingRequestIdSchema, documentNoteSchema } from "@/src/features/billing/schemas/billing.schema";

export { billingIdSchema as paymentIdSchema };

export const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"] as const;
export const paymentMethodSchema = z.enum(paymentMethods);

export const paymentCreateSchema = z.object({
  invoiceId: billingIdSchema,
  amount: z.number().positive("Enter an amount above zero.").max(1_000_000_000, "Amount is too large.").refine(isMoney, "Use at most two decimal places."),
  method: paymentMethodSchema,
  paidAt: z.iso.datetime({ offset: true }),
  reference: z.string().trim().max(120, "Use 120 characters or fewer.").refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Enter the reference on one line."),
  notes: documentNoteSchema,
  requestId: billingRequestIdSchema,
}).strict();

export const paymentListFiltersSchema = z.object({
  method: z.enum(["ALL", ...paymentMethods]).default("ALL"),
  invoiceId: billingIdSchema.optional(),
  cursor: billingIdSchema.optional(),
}).strict();

export const paymentDetailSchema = z.object({
  id: billingIdSchema,
  invoiceId: billingIdSchema,
  invoiceNumber: z.string().min(1),
  customerId: billingIdSchema,
  customerName: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  method: paymentMethodSchema,
  paidAt: z.iso.datetime(),
  reference: z.string(),
  notes: z.string(),
  recordedByName: z.string(),
  createdAt: z.iso.datetime(),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
export type PaymentListFiltersInput = z.input<typeof paymentListFiltersSchema>;
