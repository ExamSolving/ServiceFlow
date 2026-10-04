import "server-only";

import { FieldValue, type DocumentData, type Transaction } from "firebase-admin/firestore";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { hasPermission } from "@/src/lib/auth/permissions";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  workspaceSettingsFormSchema, workspaceSettingsRecordSchema,
  type WorkspaceSettingsInput, type WorkspaceSettingsRecord,
} from "../schemas/workspace-settings.schema";
import type { WorkspaceSettingsData } from "../types/workspace-settings";

export class WorkspaceSettingsAccessError extends Error {
  constructor() { super("Workspace settings access denied"); this.name = "WorkspaceSettingsAccessError"; }
}

const fields = ["currency", "defaultTaxRatePercent", "quoteValidityDays", "invoiceDueDays", "businessHoursStart", "businessHoursEnd", "weekStartsOn"] as const;

function assertSession(session: AppSession) {
  if (!session.organizationId || !session.uid || !hasPermission(session.role, "manageOrganization")) throw new WorkspaceSettingsAccessError();
}

/** Parse the shared organizationSettings document, verifying tenant ownership. */
export function parseWorkspaceSettings(documentId: string, value: DocumentData | undefined, organizationId: string): WorkspaceSettingsRecord {
  if (documentId !== organizationId) throw new Error("Workspace settings document does not belong to the session tenant");
  if (value && value.organizationId !== organizationId) throw new Error("Workspace settings ownership mismatch");
  return workspaceSettingsRecordSchema.parse(value ?? {});
}

/** Billing defaults for other repositories; usable inside a transaction. */
export async function readWorkspaceDefaults(organizationId: string, transaction?: Transaction): Promise<WorkspaceSettingsRecord> {
  const ref = adminDb.collection("organizationSettings").doc(organizationId);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  return parseWorkspaceSettings(snapshot.id, snapshot.exists ? snapshot.data() : undefined, organizationId);
}

export async function readWorkspaceSettings(session: AppSession): Promise<WorkspaceSettingsData> {
  assertSession(session);
  const [organizationSnapshot, settingsSnapshot] = await Promise.all([
    adminDb.collection("organizations").doc(session.organizationId).get(),
    adminDb.collection("organizationSettings").doc(session.organizationId).get(),
  ]);
  const organization = organizationSnapshot.data();
  if (!organizationSnapshot.exists || !organization) throw new Error("Organization record not found");
  const raw = settingsSnapshot.exists ? settingsSnapshot.data() : undefined;
  return {
    organizationName: String(organization.name ?? ""),
    timezone: typeof raw?.timezone === "string" ? raw.timezone : "UTC",
    settings: parseWorkspaceSettings(settingsSnapshot.id, raw, session.organizationId),
  };
}

export async function updateWorkspaceSettings(session: AppSession, input: WorkspaceSettingsInput): Promise<{ settings: WorkspaceSettingsRecord; changedFields: string[] }> {
  assertSession(session);
  const parsed = workspaceSettingsFormSchema.parse(input);
  const settingsRef = adminDb.collection("organizationSettings").doc(session.organizationId);
  const auditRef = adminDb.collection("auditLogs").doc();
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(settingsRef);
    const current = parseWorkspaceSettings(snapshot.id, snapshot.exists ? snapshot.data() : undefined, session.organizationId);
    const changedFields = fields.filter((field) => current[field] !== parsed[field]);
    if (!changedFields.length) return { settings: current, changedFields };
    const payload = { ...parsed, organizationId: session.organizationId, updatedAt: FieldValue.serverTimestamp() };
    if (snapshot.exists) transaction.update(settingsRef, payload);
    else transaction.set(settingsRef, { ...payload, timezone: "UTC", jobNumberPrefix: "JOB", invoiceNumberPrefix: "INV", quotationNumberPrefix: "QUO", createdAt: FieldValue.serverTimestamp() });
    transaction.create(auditRef, {
      organizationId: session.organizationId, actorUserId: session.uid,
      action: "WORKSPACE_SETTINGS_UPDATED", entityType: "ORGANIZATION", entityId: session.organizationId,
      metadata: { changedFields }, createdAt: FieldValue.serverTimestamp(),
    });
    return { settings: parsed, changedFields };
  });
}
