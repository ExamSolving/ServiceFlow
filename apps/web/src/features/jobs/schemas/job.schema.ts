import { z } from "zod";
import { serviceRequestFormSchema, serviceRequestIdSchema, serviceRequestListFiltersSchema, normalizeRequestTitle } from "@/src/features/service-requests/schemas/service-request.schema";
import { jobStatusSchema } from "@/src/features/dashboard/schemas/dashboard.schema";
export { serviceRequestIdSchema as jobIdSchema, normalizeRequestTitle as normalizeJobTitle, jobStatusSchema };
export const jobFormSchema = serviceRequestFormSchema.extend({
  serviceAddress: z.string().trim().min(5, "Enter the service location, including the address.").max(1000, "Use 1,000 characters or fewer.").refine(value => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported characters."),
}).strict();
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);
export const jobCreateSchema = jobFormSchema.extend({ requestId: z.uuid().transform(value => value.toLowerCase()) }).strict();
export const jobUpdateSchema = jobFormSchema.extend({ version }).strict();
// Conversion captures current request fields on the server; the browser supplies only location and expected version.
export const jobConvertSchema = z.object({ serviceRequestId: serviceRequestIdSchema, version, serviceAddress: jobFormSchema.shape.serviceAddress }).strict();
export const jobCancelSchema = z.object({ action: z.literal("CANCEL"), version }).strict();
/** Statuses driven by billing documents; they cannot be set from the job page. */
export const billingJobStatuses = ["INVOICED", "PARTIAL", "PAID"] as const;
export const jobTransitionSchema = z.object({
  action: z.literal("TRANSITION"),
  to: jobStatusSchema.refine((value) => !(billingJobStatuses as readonly string[]).includes(value), "Billing statuses are set from invoices and payments."),
  version,
  note: z.string().trim().max(500, "Use 500 characters or fewer.").optional(),
}).strict();
export const jobActionSchema = z.discriminatedUnion("action", [jobCancelSchema, jobTransitionSchema]);
export const jobDispatchSchema = z.object({
  technicianId: serviceRequestIdSchema,
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  version,
}).strict();
export const jobNoteSchema = z.object({
  body: z.string().trim().min(1, "Write a note first.").max(2000, "Use 2,000 characters or fewer.").refine(value => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported characters."),
  requestId: z.uuid().transform(value => value.toLowerCase()),
}).strict();
export const technicianOptionsSchema = z.object({
  q: z.string().trim().max(120).refine(value => !/[\u0000-\u001f\u007f]/.test(value) && value.isWellFormed()).default(""),
  cursor: serviceRequestIdSchema.optional(),
}).strict();
export const jobListFiltersSchema = serviceRequestListFiltersSchema.extend({ status: z.enum(["ALL", ...jobStatusSchema.options]).default("ALL") }).strict();
export const jobDetailSchema = jobFormSchema.extend({
  id: serviceRequestIdSchema, jobNumber: z.string().min(1).max(120), customerName: z.string().min(1), customerNumber: z.string().min(1), serviceTypeName: z.string().min(1),
  serviceRequestId: serviceRequestIdSchema.nullable(), assignedTechnicianId: serviceRequestIdSchema.nullable(), assignedTechnicianName: z.string().nullable(),
  scheduledAt: z.iso.datetime().nullable(), estimatedDurationMinutes: z.number().int().positive().nullable(), completedAt: z.iso.datetime().nullable(),
  status: jobStatusSchema, version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;
export type JobConvertInput = z.infer<typeof jobConvertSchema>;
export type JobCancelInput = z.infer<typeof jobCancelSchema>;
export type JobTransitionInput = z.infer<typeof jobTransitionSchema>;
export type JobActionInput = z.infer<typeof jobActionSchema>;
export type JobDispatchInput = z.infer<typeof jobDispatchSchema>;
export type JobNoteInput = z.infer<typeof jobNoteSchema>;
export type TechnicianOptionsInput = z.infer<typeof technicianOptionsSchema>;
