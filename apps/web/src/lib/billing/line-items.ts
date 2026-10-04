import { z } from "zod";

import { taxRateSchema } from "@/src/features/workspace-settings/schemas/workspace-settings.schema";
import { fromMinor, isMoney, toMinor } from "./money";

const referenceId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const safeText = (value: string) => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

export const lineItemInputSchema = z.object({
  productId: referenceId.nullable(),
  description: z.string().trim().min(1, "Describe the item.").max(300, "Use 300 characters or fewer.").refine(safeText, "Remove unsupported characters."),
  quantity: z.number().positive("Quantity must be above zero.").max(1_000_000, "Quantity is too large.").refine((value) => Math.round(value * 1000) === value * 1000, "Use at most three decimal places."),
  unitPrice: z.number().min(0, "Price cannot be negative.").max(1_000_000_000, "Price is too large.").refine(isMoney, "Use at most two decimal places."),
  taxRatePercent: taxRateSchema,
}).strict();

export const lineItemsSchema = z.array(lineItemInputSchema).min(1, "Add at least one line item.").max(100, "Use 100 line items or fewer.");

export type LineItemInput = z.infer<typeof lineItemInputSchema>;

export interface LineItem extends LineItemInput {
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface DocumentTotals {
  lineItems: LineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

/** Totals in minor units per line, then summed, so the document total equals the sum of its lines. */
export function computeTotals(items: LineItemInput[]): DocumentTotals {
  let subtotalMinor = 0;
  let taxMinor = 0;
  const lineItems = items.map((item) => {
    const lineSubtotalMinor = Math.round(toMinor(item.unitPrice) * item.quantity);
    const lineTaxMinor = Math.round(lineSubtotalMinor * item.taxRatePercent / 100);
    subtotalMinor += lineSubtotalMinor;
    taxMinor += lineTaxMinor;
    return { ...item, lineSubtotal: fromMinor(lineSubtotalMinor), lineTax: fromMinor(lineTaxMinor), lineTotal: fromMinor(lineSubtotalMinor + lineTaxMinor) };
  });
  return { lineItems, subtotal: fromMinor(subtotalMinor), taxTotal: fromMinor(taxMinor), total: fromMinor(subtotalMinor + taxMinor) };
}

/** Persisted line item shape (what repositories store and return). */
export const storedLineItemSchema = lineItemInputSchema.extend({
  lineSubtotal: z.number(),
  lineTax: z.number(),
  lineTotal: z.number(),
});
