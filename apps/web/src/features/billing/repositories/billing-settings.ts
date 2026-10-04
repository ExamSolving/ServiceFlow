import "server-only";

import type { Transaction } from "firebase-admin/firestore";

import { adminDb } from "@/src/lib/firebase/admin";
import { organizationSettingsRecordSchema } from "@/src/features/organization-settings/schemas/organization-settings.schema";
import { parseWorkspaceSettings } from "@/src/features/workspace-settings/repositories/workspace-settings.repository";
import type { WorkspaceSettingsRecord } from "@/src/features/workspace-settings/schemas/workspace-settings.schema";

export interface BillingSettings extends WorkspaceSettingsRecord {
  timezone: string;
  quotationNumberPrefix: string;
  invoiceNumberPrefix: string;
}

const prefix = organizationSettingsRecordSchema.shape.quotationNumberPrefix;
const timezone = organizationSettingsRecordSchema.shape.timezone;

/** Numbering prefixes, timezone and billing defaults from the shared organizationSettings document. */
export async function readBillingSettings(organizationId: string, transaction?: Transaction): Promise<BillingSettings> {
  const ref = adminDb.collection("organizationSettings").doc(organizationId);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  const raw = snapshot.exists ? snapshot.data() : undefined;
  const defaults = parseWorkspaceSettings(snapshot.id, raw, organizationId);
  return {
    ...defaults,
    timezone: timezone.catch("UTC").parse(raw?.timezone),
    quotationNumberPrefix: prefix.parse(raw?.quotationNumberPrefix ?? "QUO"),
    invoiceNumberPrefix: prefix.parse(raw?.invoiceNumberPrefix ?? "INV"),
  };
}

/** Allocate the next sequential document number inside the caller's transaction. */
export async function nextDocumentNumber(transaction: Transaction, organizationId: string, kind: "quotation" | "invoice", documentPrefix: string) {
  const collection = kind === "quotation" ? "quotations" : "invoices";
  const field = kind === "quotation" ? "quotationNumber" : "invoiceNumber";
  const counterRef = adminDb.collection(`${kind}Counters`).doc(organizationId);
  const counter = await transaction.get(counterRef);
  const data = counter.data();
  if (counter.exists && (!data || data.organizationId !== organizationId || !Number.isSafeInteger(data.lastNumber) || data.lastNumber < 0)) throw new Error(`Invalid ${kind} counter`);
  const nextNumber = (data?.lastNumber ?? 0) + 1;
  if (!Number.isSafeInteger(nextNumber)) throw new Error(`${kind} sequence exhausted`);
  const number = `${documentPrefix}-${String(nextNumber).padStart(6, "0")}`;
  const duplicate = await transaction.get(adminDb.collection(collection).where("organizationId", "==", organizationId).where(field, "==", number).limit(1));
  if (!duplicate.empty) throw new Error(`${kind} number already allocated`);
  return { counterRef, nextNumber, number };
}
