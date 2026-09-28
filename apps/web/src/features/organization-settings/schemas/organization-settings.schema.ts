import { z } from "zod";

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Choose a timezone.")
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone.");

const prefixSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(8, "Use no more than 8 characters.")
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores.")
  .transform((value) => value.toUpperCase());

export const organizationSettingsFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Organization name must be at least 2 characters.")
      .max(120, "Organization name must be 120 characters or fewer."),
    timezone: timezoneSchema,
    jobNumberPrefix: prefixSchema,
    invoiceNumberPrefix: prefixSchema,
    quotationNumberPrefix: prefixSchema,
  })
  .strict();

export const organizationSettingsRecordSchema = z.object({
  organizationId: z.string().min(1),
  timezone: timezoneSchema.default("UTC"),
  jobNumberPrefix: prefixSchema,
  invoiceNumberPrefix: prefixSchema,
  quotationNumberPrefix: prefixSchema,
});

export const organizationRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(160),
  ownerUserId: z.string().min(1),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]),
});

export type OrganizationSettingsInput = z.infer<
  typeof organizationSettingsFormSchema
>;
