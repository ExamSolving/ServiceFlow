import { z } from "zod";

import { lineItemsSchema } from "@/src/lib/billing/line-items";

const singleLine = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
const safeText = (value: string) => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

export const billingIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const billingVersionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
export const billingRequestIdSchema = z.uuid().transform((value) => value.toLowerCase());

export function normalizeDocumentTitle(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export const documentTitleSchema = z.string().trim().min(2, "Enter at least 2 characters.").max(120, "Use 120 characters or fewer.")
  .refine(singleLine, "Enter a title on one line.")
  .refine((value) => normalizeDocumentTitle(value).length <= 240 && value.isWellFormed(), "Use a shorter title with valid text characters.")
  .transform((value) => value.replace(/\s+/g, " "));
export const documentNotesSchema = z.string().trim().max(1000, "Use 1,000 characters or fewer.").refine(safeText, "Remove unsupported characters.");
export const documentNoteSchema = z.string().trim().max(500, "Use 500 characters or fewer.").refine(safeText, "Remove unsupported characters.");
/** Calendar date in the organization's timezone, e.g. 2026-10-04. */
export const calendarDateSchema = z.iso.date("Choose a valid date.");

export const billingCustomerOptionsSchema = z.object({
  q: z.string().trim().max(120).refine(singleLine).default(""),
  cursor: billingIdSchema.optional(),
}).strict();
export type BillingCustomerOptionsInput = z.infer<typeof billingCustomerOptionsSchema>;

/** Shared client form shape; servers rename `date` to validUntil (quotations) or dueAt (invoices). */
export const billingDocumentFormSchema = z.object({
  customerId: z.string().min(1, "Choose a customer.").max(128, "Choose a customer.").regex(/^[A-Za-z0-9_-]+$/, "Choose a customer."),
  jobId: billingIdSchema.nullable(),
  title: documentTitleSchema,
  notes: documentNotesSchema,
  date: calendarDateSchema.nullable(),
  lineItems: lineItemsSchema,
}).strict();
export type BillingDocumentFormValues = z.infer<typeof billingDocumentFormSchema>;

export interface BillingDocumentSource {
  /** Job the document is raised for; pins the customer. */
  jobId: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  title: string;
}
