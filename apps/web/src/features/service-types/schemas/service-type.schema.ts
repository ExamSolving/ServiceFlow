import { z } from "zod";

const singleLine = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
const safeDescription = (value: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const searchableName = (value: string) => {
  const normalized = normalizeServiceTypeName(value);
  return normalized.length <= 240 && normalized.isWellFormed();
};

export const serviceTypeIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export function normalizeServiceTypeName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export const serviceTypeFormSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(120, "Use 120 characters or fewer.")
    .refine(singleLine, "Enter a name on one line.")
    .refine(searchableName, "Use a shorter name with valid text characters."),
  description: z.string().trim().max(500, "Use 500 characters or fewer.")
    .refine(safeDescription, "Remove unsupported control characters."),
  estimatedDurationMinutes: z.number().int("Enter a whole number of minutes.")
    .min(5, "Enter at least 5 minutes.").max(1440, "Use 1,440 minutes or fewer."),
  isActive: z.boolean(),
}).strict();

export const serviceTypeCreateSchema = serviceTypeFormSchema.extend({
  requestId: z.uuid().transform((value) => value.toLowerCase()),
}).strict();

export const serviceTypeUpdateSchema = serviceTypeFormSchema.extend({
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
}).strict();

export const serviceTypeListFiltersSchema = z.object({
  q: z.string().trim().max(120).refine(singleLine).refine(searchableName).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  cursor: serviceTypeIdSchema.optional(),
}).strict();

export type ServiceTypeCreateInput = z.infer<typeof serviceTypeCreateSchema>;
export type ServiceTypeUpdateInput = z.infer<typeof serviceTypeUpdateSchema>;
