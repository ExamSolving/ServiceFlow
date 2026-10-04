import { z } from "zod";

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "US Dollar (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "British Pound (GBP)" },
  { value: "INR", label: "Indian Rupee (INR)" },
  { value: "AED", label: "UAE Dirham (AED)" },
  { value: "AUD", label: "Australian Dollar (AUD)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
  { value: "SGD", label: "Singapore Dollar (SGD)" },
  { value: "ZAR", label: "South African Rand (ZAR)" },
  { value: "JPY", label: "Japanese Yen (JPY)" },
  { value: "BRL", label: "Brazilian Real (BRL)" },
] as const;

export const currencyCodes = CURRENCY_OPTIONS.map((option) => option.value) as unknown as readonly [string, ...string[]];
export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["value"];

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:00.");
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export const taxRateSchema = z.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot exceed 100%.")
  .refine((value) => Math.round(value * 100) === value * 100, "Use at most two decimal places.");

export const workspaceSettingsFormSchema = z.object({
  currency: z.enum(currencyCodes),
  defaultTaxRatePercent: taxRateSchema,
  quoteValidityDays: z.number().int("Enter whole days.").min(1, "At least 1 day.").max(365, "At most 365 days."),
  invoiceDueDays: z.number().int("Enter whole days.").min(0, "Cannot be negative.").max(365, "At most 365 days."),
  businessHoursStart: clock,
  businessHoursEnd: clock,
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
}).strict().refine((values) => minutes(values.businessHoursEnd) > minutes(values.businessHoursStart), {
  path: ["businessHoursEnd"], message: "Closing time must be after opening time.",
});

export const WORKSPACE_SETTINGS_DEFAULTS = {
  currency: "USD" as CurrencyCode,
  defaultTaxRatePercent: 0,
  quoteValidityDays: 30,
  invoiceDueDays: 14,
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  weekStartsOn: 1 as 0 | 1,
};

// Tolerant read schema: documents written before a field existed fall back to defaults.
export const workspaceSettingsRecordSchema = z.object({
  currency: z.enum(currencyCodes).catch(WORKSPACE_SETTINGS_DEFAULTS.currency),
  defaultTaxRatePercent: taxRateSchema.catch(WORKSPACE_SETTINGS_DEFAULTS.defaultTaxRatePercent),
  quoteValidityDays: z.number().int().min(1).max(365).catch(WORKSPACE_SETTINGS_DEFAULTS.quoteValidityDays),
  invoiceDueDays: z.number().int().min(0).max(365).catch(WORKSPACE_SETTINGS_DEFAULTS.invoiceDueDays),
  businessHoursStart: clock.catch(WORKSPACE_SETTINGS_DEFAULTS.businessHoursStart),
  businessHoursEnd: clock.catch(WORKSPACE_SETTINGS_DEFAULTS.businessHoursEnd),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).catch(WORKSPACE_SETTINGS_DEFAULTS.weekStartsOn),
});

export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsFormSchema>;
export type WorkspaceSettingsRecord = z.infer<typeof workspaceSettingsRecordSchema>;
