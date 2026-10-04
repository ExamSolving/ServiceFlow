import { z } from "zod";

import { lineItemsSchema, storedLineItemSchema } from "@/src/lib/billing/line-items";
import { billingIdSchema, billingRequestIdSchema, billingVersionSchema, calendarDateSchema, documentNoteSchema, documentNotesSchema, documentTitleSchema, normalizeDocumentTitle } from "@/src/features/billing/schemas/billing.schema";

export { billingIdSchema as quotationIdSchema, normalizeDocumentTitle as normalizeQuotationTitle };

export const quotationStatuses = ["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"] as const;
export const quotationStatusSchema = z.enum(quotationStatuses);
export const quotationActions = ["SEND", "APPROVE", "REJECT", "EXPIRE"] as const;

export const quotationFormSchema = z.object({
  customerId: billingIdSchema,
  jobId: billingIdSchema.nullable(),
  title: documentTitleSchema,
  notes: documentNotesSchema,
  validUntil: calendarDateSchema.nullable(),
  lineItems: lineItemsSchema,
}).strict();
export const quotationCreateSchema = quotationFormSchema.extend({ requestId: billingRequestIdSchema }).strict();
export const quotationUpdateSchema = quotationFormSchema.extend({ version: billingVersionSchema }).strict();
export const quotationActionSchema = z.object({ action: z.enum(quotationActions), version: billingVersionSchema, note: documentNoteSchema.optional() }).strict();
export const quotationConvertSchema = z.object({ version: billingVersionSchema, requestId: billingRequestIdSchema }).strict();
export const quotationListFiltersSchema = z.object({
  q: z.string().trim().max(120).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)).default(""),
  status: z.enum(["ALL", ...quotationStatuses]).default("ALL"),
  cursor: billingIdSchema.optional(),
}).strict();

/** Public DTO shape, also used by clients to validate API responses. */
export const quotationDetailSchema = z.object({
  id: billingIdSchema,
  quotationNumber: z.string().min(1),
  status: quotationStatusSchema,
  customerId: billingIdSchema,
  customerName: z.string().min(1),
  customerNumber: z.string().min(1),
  jobId: billingIdSchema.nullable(),
  jobNumber: z.string().nullable(),
  title: z.string().min(1),
  notes: z.string(),
  currency: z.string().min(3).max(3),
  lineItems: z.array(storedLineItemSchema).min(1),
  subtotal: z.number(),
  taxTotal: z.number(),
  total: z.number(),
  validUntil: calendarDateSchema,
  sentAt: z.iso.datetime().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  invoiceId: billingIdSchema.nullable(),
  invoiceNumber: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type QuotationCreateInput = z.infer<typeof quotationCreateSchema>;
export type QuotationUpdateInput = z.infer<typeof quotationUpdateSchema>;
export type QuotationActionInput = z.infer<typeof quotationActionSchema>;
export type QuotationConvertInput = z.infer<typeof quotationConvertSchema>;
export type QuotationListFiltersInput = z.input<typeof quotationListFiltersSchema>;
