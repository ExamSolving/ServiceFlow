import { z } from "zod";

export const memberIdSchema = z.string().min(1).max(257).regex(/^[A-Za-z0-9_-]+$/);
export const invitationIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const invitationTokenSchema = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const invitableRoles = ["ADMIN", "MANAGER", "DISPATCHER", "TECHNICIAN", "ACCOUNTANT"] as const;
export const memberStatuses = ["ACTIVE", "INVITED", "SUSPENDED"] as const;
export const invitationStatuses = ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;

export const INVITATION_TTL_DAYS = 7;

export function normalizeEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

const emailSchema = z.string().trim().min(3, "Enter an email address.").max(254, "Use 254 characters or fewer.")
  .refine((value) => z.email().safeParse(value).success, "Enter a valid email address.")
  .transform(normalizeEmail);

const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1);

export const invitationCreateSchema = z.object({
  email: emailSchema,
  role: z.enum(invitableRoles),
  requestId: z.uuid().transform((value) => value.toLowerCase()),
}).strict();

export const invitationVersionSchema = z.object({ version }).strict();

export const memberRoleUpdateSchema = z.object({ role: z.enum(invitableRoles), version }).strict();

export const memberStatusSchema = z.object({ action: z.enum(["SUSPEND", "REACTIVATE"]), version }).strict();

export const invitationAcceptSchema = z.object({ token: invitationTokenSchema }).strict();

export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;
export type MemberRoleUpdateInput = z.infer<typeof memberRoleUpdateSchema>;
export type MemberStatusInput = z.infer<typeof memberStatusSchema>;
export type InvitationVersionInput = z.infer<typeof invitationVersionSchema>;
