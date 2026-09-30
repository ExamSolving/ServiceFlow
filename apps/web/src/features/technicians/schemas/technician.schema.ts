import { z } from "zod";

const singleLine = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
const searchableName = (value: string) => {
  const normalized = normalizeTechnicianName(value);
  return normalized.length <= 240 && normalized.isWellFormed();
};

export const TECHNICIAN_STATUSES = ["AVAILABLE", "BUSY", "OFFLINE", "ON_LEAVE", "INACTIVE"] as const;
export const technicianStatusSchema = z.enum(TECHNICIAN_STATUSES);
export const technicianIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const technicianMemberCursorSchema = z.string().min(1).max(257).regex(/^[A-Za-z0-9_-]+$/);

export function normalizeTechnicianName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export const technicianFormSchema = z.object({
  displayName: z.string().trim().min(2, "Enter at least 2 characters.").max(120, "Use 120 characters or fewer.")
    .refine(singleLine, "Enter a name on one line.")
    .refine(searchableName, "Use a shorter name with valid text characters."),
  phone: z.string().trim().max(32, "Use 32 characters or fewer.")
    .refine((value) => value === "" || /^\+?[0-9() .-]+$/.test(value), "Use numbers and standard phone punctuation.")
    .refine((value) => { const digits = value.replace(/\D/g, ""); return value === "" || (digits.length >= 7 && digits.length <= 15); }, "Use a phone number with 7 to 15 digits."),
  status: technicianStatusSchema,
}).strict();

export const technicianCreateSchema = technicianFormSchema.extend({
  userId: technicianIdSchema,
  requestId: z.uuid().transform((value) => value.toLowerCase()),
}).strict();
export const technicianUpdateSchema = technicianFormSchema.extend({
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
}).strict();
export const technicianListFiltersSchema = z.object({
  q: z.string().trim().max(120).refine(singleLine).refine(searchableName).default(""),
  status: z.enum(["ALL", ...TECHNICIAN_STATUSES]).default("ALL"),
  cursor: technicianIdSchema.optional(),
}).strict();
export const technicianMemberFiltersSchema = z.object({ memberCursor: technicianMemberCursorSchema.optional() }).strict();

export type TechnicianCreateInput = z.infer<typeof technicianCreateSchema>;
export type TechnicianUpdateInput = z.infer<typeof technicianUpdateSchema>;
