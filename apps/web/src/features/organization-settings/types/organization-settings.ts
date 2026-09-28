import type { z } from "zod";

import type {
  organizationSettingsFormSchema,
  organizationSettingsRecordSchema,
} from "../schemas/organization-settings.schema";

export type OrganizationSettingsFormValues = z.infer<
  typeof organizationSettingsFormSchema
>;

export type OrganizationSettingsRecord = z.infer<
  typeof organizationSettingsRecordSchema
>;

export interface OrganizationSettingsData {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  settings: OrganizationSettingsRecord;
}

export const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "America/Sao_Paulo", label: "Brasilia Time (São Paulo)" },
  { value: "Europe/London", label: "GMT / BST (London)" },
  { value: "Europe/Paris", label: "Central European Time (Paris)" },
  { value: "Europe/Berlin", label: "Central European Time (Berlin)" },
  { value: "Africa/Johannesburg", label: "South Africa Standard Time" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (Dubai)" },
  { value: "Asia/Kolkata", label: "India Standard Time (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore Standard Time" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (Tokyo)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (Sydney)" },
] as const;
