import "server-only";

import { notFound } from "next/navigation";

import { readBillingSettings } from "@/src/features/billing/repositories/billing-settings";
import { localDate } from "@/src/features/dashboard/utils/date";
import { requirePermission } from "@/src/lib/auth/authorization";
import { hasPermission } from "@/src/lib/auth/permissions";
import { logger } from "@/src/lib/observability/logger";
import { QuotationCursorError, QuotationNotFoundError } from "../repositories/quotation-errors";
import { listQuotations, readQuotation } from "../repositories/quotation.repository";
import { quotationListFiltersSchema } from "../schemas/quotation.schema";
import type { QuotationContext, QuotationListData, QuotationSearchParams } from "../types/quotation";

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function getQuotationsPage(rawSearchParams: QuotationSearchParams = {}): Promise<QuotationListData> {
  const session = await requirePermission("manageQuotations");
  const settings = await readBillingSettings(session.organizationId);
  const today = localDate(new Date(), settings.timezone);
  const parsed = quotationListFiltersSchema.safeParse({ q: single(rawSearchParams.q), status: single(rawSearchParams.status), cursor: single(rawSearchParams.cursor) });
  if (!parsed.success) return { quotations: [], filters: { q: "", status: "ALL" }, nextCursor: null, today, filterError: "These filters are invalid. Clear them and try again." };
  try {
    return { ...(await listQuotations(session, parsed.data)), today };
  } catch (error) {
    if (error instanceof QuotationCursorError) return { quotations: [], filters: parsed.data, nextCursor: null, today, filterError: "This page is no longer available. Return to the first page to continue." };
    logger.error("QUOTATIONS", "List failed", error);
    throw new Error("We couldn’t load quotations. Please try again.");
  }
}

export async function getQuotationContext(quotationId: string): Promise<QuotationContext> {
  const session = await requirePermission("manageQuotations");
  try {
    const [quotation, settings] = await Promise.all([readQuotation(session, quotationId), readBillingSettings(session.organizationId)]);
    return { quotation, timezone: settings.timezone, today: localDate(new Date(), settings.timezone), canConvert: hasPermission(session.role, "manageInvoices"), defaultTaxRatePercent: settings.defaultTaxRatePercent, quoteValidityDays: settings.quoteValidityDays };
  } catch (error) {
    if (error instanceof QuotationNotFoundError) notFound();
    logger.error("QUOTATIONS", "Detail failed", error);
    throw new Error("We couldn’t load this quotation. Please try again.");
  }
}
