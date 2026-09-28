import { z } from "zod";

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}, "Choose a date between 2000 and 2100.");
export const dashboardFilterSchema = z.object({date:calendarDateSchema});
export type DashboardFilterValues = z.infer<typeof dashboardFilterSchema>;

export const jobStatusSchema = z.enum(["NEW","ASSIGNED","ACCEPTED","EN_ROUTE","ARRIVED","DIAGNOSING","QUOTATION_REQUIRED","WAITING_APPROVAL","APPROVED","IN_PROGRESS","ON_HOLD","COMPLETED","INVOICED","PARTIAL","PAID","CLOSED","REJECTED","CANCELLED","RESCHEDULED"]);
export const technicianStatusSchema = z.enum(["AVAILABLE","BUSY","OFFLINE","ON_LEAVE","INACTIVE"]);
const timestampSchema = z.preprocess(value => {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  return value;
}, z.date()).transform(value=>value.toISOString());
export const dashboardJobSchema = z.object({
  organizationId:z.string().min(1), jobNumber:z.string().min(1).max(120), title:z.string().min(1).max(300),
  status:jobStatusSchema, priority:z.enum(["LOW","NORMAL","HIGH","URGENT"]),
  assignedTechnicianId:z.string().nullable().optional(), scheduledAt:timestampSchema.nullable().optional().transform(value=>value??null), createdAt:timestampSchema,
});
export const dashboardTechnicianSchema = z.object({organizationId:z.string().min(1),userId:z.string().min(1),displayName:z.string().min(1).max(200),status:technicianStatusSchema});
export const dashboardSettingsSchema = z.object({organizationId:z.string().min(1),timezone:z.string().refine(value=>{try {new Intl.DateTimeFormat("en",{timeZone:value});return true;}catch{return false;}},"Invalid organization timezone").optional()});
