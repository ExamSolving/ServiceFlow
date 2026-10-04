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
export const jobListFiltersSchema = serviceRequestListFiltersSchema.extend({ status: z.enum(["ALL", ...jobStatusSchema.options]).default("ALL") }).strict();
export const jobDetailSchema = jobFormSchema.extend({
  id: serviceRequestIdSchema, jobNumber: z.string().min(1).max(120), customerName: z.string().min(1), customerNumber: z.string().min(1), serviceTypeName: z.string().min(1),
  serviceRequestId: serviceRequestIdSchema.nullable(), assignedTechnicianId: serviceRequestIdSchema.nullable(), scheduledAt: z.iso.datetime().nullable(),
  status: jobStatusSchema, version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;
export type JobConvertInput = z.infer<typeof jobConvertSchema>;
export type JobCancelInput = z.infer<typeof jobCancelSchema>;
