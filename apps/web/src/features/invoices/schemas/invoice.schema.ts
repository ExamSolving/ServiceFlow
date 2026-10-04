import { z } from "zod";

import { lineItemsSchema, storedLineItemSchema } from "@/src/lib/billing/line-items";
import { billingIdSchema, billingRequestIdSchema, billingVersionSchema, calendarDateSchema, documentNoteSchema, documentNotesSchema, documentTitleSchema, normalizeDocumentTitle } from "@/src/features/billing/schemas/billing.schema";

export { billingIdSchema as invoiceIdSchema, normalizeDocumentTitle as normalizeInvoiceTitle };

export const invoiceStatuses = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID"] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export const openInvoiceStatuses = ["ISSUED", "PARTIALLY_PAID"] as const;
export const invoiceActions = ["ISSUE", "VOID"] as const;

export const invoiceFormSchema = z.object({
  customerId: billingIdSchema,
  jobId: billingIdSchema.nullable(),
  title: documentTitleSchema,
  notes: documentNotesSchema,
  dueAt: calendarDateSchema.nullable(),
  lineItems: lineItemsSchema,
}).strict();
export const invoiceCreateSchema = invoiceFormSchema.extend({ requestId: billingRequestIdSchema }).strict();
export const invoiceUpdateSchema = invoiceFormSchema.extend({ version: billingVersionSchema }).strict();
export const invoiceActionSchema = z.object({ action: z.enum(invoiceActions), version: billingVersionSchema, note: documentNoteSchema.optional() }).strict();
export const invoiceListFiltersSchema = z.object({
  q: z.string().trim().max(120).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)).default(""),
  status: z.enum(["ALL", ...invoiceStatuses]).default("ALL"),
  cursor: billingIdSchema.optional(),
}).strict();

export const invoiceDetailSchema = z.object({
  id: billingIdSchema,
  invoiceNumber: z.string().min(1),
  status: invoiceStatusSchema,
  customerId: billingIdSchema,
  customerName: z.string().min(1),
  customerNumber: z.string().min(1),
  jobId: billingIdSchema.nullable(),
  jobNumber: z.string().nullable(),
  quotationId: billingIdSchema.nullable(),
  quotationNumber: z.string().nullable(),
  title: z.string().min(1),
  notes: z.string(),
  currency: z.string().min(3).max(3),
  lineItems: z.array(storedLineItemSchema).min(1),
  subtotal: z.number(),
  taxTotal: z.number(),
  total: z.number(),
  amountPaid: z.number().min(0),
  balanceDue: z.number().min(0),
  dueAt: calendarDateSchema.nullable(),
  issuedAt: z.iso.datetime().nullable(),
  paidAt: z.iso.datetime().nullable(),
  voidedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
export type InvoiceActionInput = z.infer<typeof invoiceActionSchema>;
export type InvoiceListFiltersInput = z.input<typeof invoiceListFiltersSchema>;
