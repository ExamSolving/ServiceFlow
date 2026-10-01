import { z } from "zod";

export const serviceRequestIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
// Reference fields share the identifier rules but report a single, field-specific message.
const referenceIdSchema = (message: string) => z.string().min(1, message).max(128, message).regex(/^[A-Za-z0-9_-]+$/, message);
export const serviceRequestStatuses = ["NEW", "REVIEWING", "SCHEDULED", "CONVERTED_TO_JOB", "CANCELLED"] as const;
export const serviceRequestPriorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export function normalizeRequestTitle(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
const singleLine = (value: string) => !/[\u0000-\u001f\u007f]/.test(value) && value.isWellFormed();
const searchable = (value: string) => normalizeRequestTitle(value).length <= 320;
export const serviceRequestFormSchema = z.object({
  customerId: referenceIdSchema("Choose a customer."),
  serviceTypeId: referenceIdSchema("Choose a service type."),
  title: z.string().trim().min(3, "Enter at least 3 characters.").max(160, "Use 160 characters or fewer.").refine(singleLine, "Enter valid text on one line.").refine(searchable, "Use a shorter title.").transform(value => value.replace(/\s+/g, " ")),
  description: z.string().trim().min(10, "Describe the request in at least 10 characters.").max(4000, "Use 4,000 characters or fewer.").refine(value => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Remove unsupported characters."),
  priority: z.enum(serviceRequestPriorities),
}).strict();
export const serviceRequestCreateSchema = serviceRequestFormSchema.extend({ requestId: z.uuid().transform(value => value.toLowerCase()) }).strict();
export const serviceRequestUpdateSchema = serviceRequestFormSchema.extend({ version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1) }).strict();
export const serviceRequestTransitionSchema = z.object({ action: z.enum(["START_REVIEW", "CANCEL"]), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1) }).strict();
export const serviceRequestListFiltersSchema = z.object({
  q: z.string().trim().max(160).refine(singleLine).refine(searchable).default(""),
  status: z.enum(["ALL", ...serviceRequestStatuses]).default("ALL"),
  priority: z.enum(["ALL", ...serviceRequestPriorities]).default("ALL"),
  cursor: serviceRequestIdSchema.optional(),
}).strict();
export const serviceRequestOptionsSchema = z.object({
  kind: z.enum(["customers", "serviceTypes"]),
  q: z.string().trim().max(120).refine(singleLine).refine(searchable).default(""),
  cursor: serviceRequestIdSchema.optional(),
}).strict();
export type ServiceRequestCreateInput = z.infer<typeof serviceRequestCreateSchema>;
export type ServiceRequestUpdateInput = z.infer<typeof serviceRequestUpdateSchema>;
export type ServiceRequestTransitionInput = z.infer<typeof serviceRequestTransitionSchema>;
export type ServiceRequestOptionsInput = z.infer<typeof serviceRequestOptionsSchema>;
