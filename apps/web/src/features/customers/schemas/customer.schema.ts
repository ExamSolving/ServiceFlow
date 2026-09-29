import { z } from "zod";

const singleLine = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
const searchableName = (value: string) => {
  const normalized = normalizeCustomerName(value);
  return normalized.length <= 240 && normalized.isWellFormed();
};

// Restrict identifiers before constructing any Firestore document reference.
export const customerIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export function normalizeCustomerName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export const customerFormSchema = z.object({
  type: z.enum(["INDIVIDUAL", "BUSINESS"]),
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(120, "Use 120 characters or fewer.")
    .refine(singleLine, "Enter a name on one line.")
    .refine(searchableName, "Use a shorter name with valid text characters."),
  email: z.string().trim().max(254, "Use 254 characters or fewer.")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address."),
  phone: z.string().trim().min(7, "Enter a valid phone number.").max(32, "Use 32 characters or fewer.")
    .regex(/^\+?[0-9() .-]+$/, "Use numbers and standard phone punctuation.")
    .refine((value) => { const digits = value.replace(/\D/g, ""); return digits.length >= 7 && digits.length <= 15; }, "Use a phone number with 7 to 15 digits."),
  notes: z.string().trim().max(2000, "Use 2,000 characters or fewer.")
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported characters from notes."),
  isActive: z.boolean(),
}).strict();

export const customerCreateSchema = customerFormSchema.extend({ requestId: z.uuid().transform((value) => value.toLowerCase()) }).strict();
export const customerUpdateSchema = customerFormSchema.extend({ version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1) }).strict();
export const customerListFiltersSchema = z.object({
  q: z.string().trim().max(120).refine(singleLine).refine(searchableName).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  cursor: customerIdSchema.optional(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
