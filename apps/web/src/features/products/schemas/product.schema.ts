import { z } from "zod";

import { isMoney } from "@/src/lib/billing/money";
import { taxRateSchema } from "@/src/features/workspace-settings/schemas/workspace-settings.schema";

const singleLine = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
const safeText = (value: string) => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);

// Restrict identifiers before constructing any Firestore document reference.
export const productIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export function normalizeProductName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** SKUs are compared case-insensitively; the stored form is upper case. */
export function normalizeSku(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export const MAX_STOCK_QUANTITY = 1_000_000;
export const stockMovementTypes = ["IN", "OUT", "ADJUST"] as const;
export type StockMovementType = (typeof stockMovementTypes)[number];

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(120, "Use 120 characters or fewer.")
    .refine(singleLine, "Enter a name on one line.")
    .refine((value) => normalizeProductName(value).length <= 240 && value.isWellFormed(), "Use a shorter name with valid text characters.")
    .transform((value) => value.replace(/\s+/g, " ")),
  sku: z.string().trim().min(2, "Use at least 2 characters.").max(40, "Use 40 characters or fewer.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use letters, numbers, dots, hyphens, underscores or slashes.")
    .transform(normalizeSku),
  description: z.string().trim().max(500, "Use 500 characters or fewer.").refine(safeText, "Remove unsupported characters."),
  unit: z.string().trim().min(1, "Enter a unit, such as pc or hr.").max(16, "Use 16 characters or fewer.").refine(singleLine, "Enter the unit on one line."),
  unitPrice: z.number().min(0, "Price cannot be negative.").max(1_000_000_000, "Price is too large.").refine(isMoney, "Use at most two decimal places."),
  taxRatePercent: taxRateSchema.nullable(),
  trackStock: z.boolean(),
  reorderLevel: z.number().int("Enter a whole number.").min(0, "Cannot be negative.").max(MAX_STOCK_QUANTITY, "Reorder level is too large."),
  isActive: z.boolean(),
}).strict();

export const productCreateSchema = productFormSchema.extend({ requestId: z.uuid().transform((value) => value.toLowerCase()) }).strict();
export const productUpdateSchema = productFormSchema.extend({ version }).strict();

export const productListFiltersSchema = z.object({
  q: z.string().trim().max(120).refine(singleLine).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  stock: z.enum(["ALL", "TRACKED", "LOW"]).default("ALL"),
  cursor: productIdSchema.optional(),
}).strict();

export const productOptionsSchema = z.object({
  q: z.string().trim().max(120).refine(singleLine).default(""),
  cursor: productIdSchema.optional(),
}).strict();

/** Shape returned by /api/products/options and consumed by pickers. */
export const productPickSchema = z.object({
  id: productIdSchema,
  name: z.string().min(1),
  secondary: z.string().optional(),
  unitPrice: z.number().min(0),
  taxRatePercent: z.number().min(0).max(100).nullable(),
  unit: z.string().min(1),
});
export type ProductPick = z.infer<typeof productPickSchema>;

export const stockMovementSchema = z.object({
  productId: productIdSchema,
  type: z.enum(stockMovementTypes),
  /** IN/OUT: units moved. ADJUST: the counted quantity on hand. */
  quantity: z.number().int("Enter whole units.").min(0, "Cannot be negative.").max(MAX_STOCK_QUANTITY, "Quantity is too large."),
  reason: z.string().trim().max(300, "Use 300 characters or fewer.").refine(safeText, "Remove unsupported characters."),
  reference: z.string().trim().max(120, "Use 120 characters or fewer.").refine(singleLine, "Enter the reference on one line."),
  requestId: z.uuid().transform((value) => value.toLowerCase()),
}).strict().refine((value) => value.type === "ADJUST" || value.quantity > 0, { path: ["quantity"], message: "Enter a quantity above zero." });

export const stockMovementListFiltersSchema = z.object({
  productId: productIdSchema.optional(),
  type: z.enum(["ALL", ...stockMovementTypes]).default("ALL"),
  cursor: productIdSchema.optional(),
}).strict();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductListFiltersInput = z.input<typeof productListFiltersSchema>;
export type ProductOptionsInput = z.infer<typeof productOptionsSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type StockMovementListFiltersInput = z.input<typeof stockMovementListFiltersSchema>;
