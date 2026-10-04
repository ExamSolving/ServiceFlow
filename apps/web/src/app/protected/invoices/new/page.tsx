import type { Metadata } from "next";

import { DocumentForm } from "@/src/features/billing/components/document-form";
import { readBillingSettings } from "@/src/features/billing/repositories/billing-settings";
import { getBillingSourceFromJob } from "@/src/features/billing/services/billing-source.service";
import { requirePermission } from "@/src/lib/auth/authorization";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("manageInvoices");
  const params = await searchParams;
  const [source, settings] = await Promise.all([getBillingSourceFromJob(params.jobId, "manageInvoices"), readBillingSettings(session.organizationId)]);
  return <DocumentForm key={source?.jobId ?? "blank"} kind="invoice" source={source ?? undefined} currency={settings.currency} defaultTaxRatePercent={settings.defaultTaxRatePercent} defaultDays={settings.invoiceDueDays} />;
}
