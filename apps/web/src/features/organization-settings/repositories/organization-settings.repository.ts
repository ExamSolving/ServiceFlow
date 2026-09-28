import "server-only";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { adminDb } from "@/src/lib/firebase/admin";
import {
  organizationRecordSchema,
  organizationSettingsFormSchema,
  organizationSettingsRecordSchema,
  type OrganizationSettingsInput,
} from "../schemas/organization-settings.schema";
import type { OrganizationSettingsData } from "../types/organization-settings";

const DEFAULT_SETTINGS = {
  timezone: "UTC",
  jobNumberPrefix: "JOB",
  invoiceNumberPrefix: "INV",
  quotationNumberPrefix: "QUO",
} as const;

function assertTenantDocument(documentId: string, session: AppSession) {
  if (!session.organizationId || documentId !== session.organizationId) {
    throw new Error("Organization document does not belong to the session tenant");
  }
}

function assertActiveOrganization(status: string) {
  if (status !== "ACTIVE") {
    throw new Error("Organization is not active");
  }
}

function parseOrganization(
  documentId: string,
  value: DocumentData | undefined,
  session: AppSession,
) {
  assertTenantDocument(documentId, session);
  const organization = organizationRecordSchema.parse({
    ...(value ?? {}),
    id: documentId,
  });
  assertActiveOrganization(organization.status);
  return organization;
}

function parseSettings(
  documentId: string,
  value: DocumentData | undefined,
  session: AppSession,
) {
  assertTenantDocument(documentId, session);
  if (value && value.organizationId !== session.organizationId) {
    throw new Error("Organization settings ownership mismatch");
  }
  return organizationSettingsRecordSchema.parse({
    ...DEFAULT_SETTINGS,
    ...(value ?? {}),
    organizationId: value?.organizationId ?? session.organizationId,
  });
}

function toData(
  organization: ReturnType<typeof organizationRecordSchema.parse>,
  settings: ReturnType<typeof organizationSettingsRecordSchema.parse>,
): OrganizationSettingsData {
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    settings,
  };
}

export async function readOrganizationSettings(
  session: AppSession,
): Promise<OrganizationSettingsData> {
  const organizationRef = adminDb
    .collection("organizations")
    .doc(session.organizationId);
  const settingsRef = adminDb
    .collection("organizationSettings")
    .doc(session.organizationId);

  const [organizationSnapshot, settingsSnapshot] = await Promise.all([
    organizationRef.get(),
    settingsRef.get(),
  ]);

  if (!organizationSnapshot.exists) {
    throw new Error("Organization record not found");
  }

  const organization = parseOrganization(
    organizationSnapshot.id,
    organizationSnapshot.data(),
    session,
  );
  const settings = parseSettings(
    settingsSnapshot.id,
    settingsSnapshot.exists ? settingsSnapshot.data() : undefined,
    session,
  );

  return toData(organization, settings);
}

export async function updateOrganizationSettings(
  session: AppSession,
  input: OrganizationSettingsInput,
): Promise<{ data: OrganizationSettingsData; changedFields: string[] }> {
  const parsed = organizationSettingsFormSchema.parse(input);
  const organizationRef = adminDb
    .collection("organizations")
    .doc(session.organizationId);
  const settingsRef = adminDb
    .collection("organizationSettings")
    .doc(session.organizationId);
  const auditRef = adminDb.collection("auditLogs").doc();

  return adminDb.runTransaction(async (transaction) => {
    const organizationSnapshot = await transaction.get(organizationRef);
    const settingsSnapshot = await transaction.get(settingsRef);

    if (!organizationSnapshot.exists) {
      throw new Error("Organization record not found");
    }

    const organization = parseOrganization(
      organizationSnapshot.id,
      organizationSnapshot.data(),
      session,
    );
    const currentSettings = parseSettings(
      settingsSnapshot.id,
      settingsSnapshot.exists ? settingsSnapshot.data() : undefined,
      session,
    );
    const nextSettings = organizationSettingsRecordSchema.parse({
      organizationId: session.organizationId,
      ...parsed,
    });
    const changedFields = [
      ...(organization.name !== parsed.name ? ["name"] : []),
      ...(["timezone", "jobNumberPrefix", "invoiceNumberPrefix", "quotationNumberPrefix"] as const).filter(
        (field) => currentSettings[field] !== nextSettings[field],
      ),
    ];

    if (changedFields.length === 0) {
      return { data: toData(organization, currentSettings), changedFields };
    }

    transaction.update(organizationRef, {
      name: parsed.name,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (settingsSnapshot.exists) {
      transaction.update(settingsRef, {
        organizationId: session.organizationId,
        timezone: nextSettings.timezone,
        jobNumberPrefix: nextSettings.jobNumberPrefix,
        invoiceNumberPrefix: nextSettings.invoiceNumberPrefix,
        quotationNumberPrefix: nextSettings.quotationNumberPrefix,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.set(settingsRef, {
        organizationId: session.organizationId,
        timezone: nextSettings.timezone,
        jobNumberPrefix: nextSettings.jobNumberPrefix,
        invoiceNumberPrefix: nextSettings.invoiceNumberPrefix,
        quotationNumberPrefix: nextSettings.quotationNumberPrefix,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.create(auditRef, {
      organizationId: session.organizationId,
      actorUserId: session.uid,
      action: "ORGANIZATION_SETTINGS_UPDATED",
      entityType: "ORGANIZATION",
      entityId: session.organizationId,
      metadata: { changedFields },
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      data: toData(
        { ...organization, name: parsed.name },
        nextSettings,
      ),
      changedFields,
    };
  });
}
