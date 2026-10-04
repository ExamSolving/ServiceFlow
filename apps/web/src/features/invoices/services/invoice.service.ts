import "server-only";

import { notFound } from "next/navigation";

import { readBillingSettings } from "@/src/features/billing/repositories/billing-settings";
import { localDate } from "@/src/features/dashboard/utils/date";
import { listPaymentsForInvoice } from "@/src/features/payments/repositories/payment.repository";
import { requirePermission } from "@/src/lib/auth/authorization";
import { hasPermission } from "@/src/lib/auth/permissions";
import { logger } from "@/src/lib/observability/logger";
import { InvoiceCursorError, InvoiceNotFoundError } from "../repositories/invoice-errors";
import { listInvoices, readInvoice } from "../repositories/invoice.repository";
import { invoiceListFiltersSchema } from "../schemas/invoice.schema";
import type { InvoiceContext, InvoiceListData, InvoiceSearchParams } from "../types/invoice";

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function getInvoicesPage(rawSearchParams: InvoiceSearchParams = {}): Promise<InvoiceListData> {
  const session = await requirePermission("manageInvoices");
  const settings = await readBillingSettings(session.organizationId);
  const today = localDate(new Date(), settings.timezone);
  const parsed = invoiceListFiltersSchema.safeParse({ q: single(rawSearchParams.q), status: single(rawSearchParams.status), cursor: single(rawSearchParams.cursor) });
  if (!parsed.success) return { invoices: [], filters: { q: "", status: "ALL" }, nextCursor: null, today, filterError: "These filters are invalid. Clear them and try again." };
  try {
    return { ...(await listInvoices(session, parsed.data)), today };
  } catch (error) {
    if (error instanceof InvoiceCursorError) return { invoices: [], filters: parsed.data, nextCursor: null, today, filterError: "This page is no longer available. Return to the first page to continue." };
    logger.error("INVOICES", "List failed", error);
    throw new Error("We couldn’t load invoices. Please try again.");
  }
}

export async function getInvoiceContext(invoiceId: string): Promise<InvoiceContext> {
  const session = await requirePermission("manageInvoices");
  try {
    const invoice = await readInvoice(session, invoiceId);
    const [payments, settings] = await Promise.all([listPaymentsForInvoice(session, invoice.id), readBillingSettings(session.organizationId)]);
    return { invoice, payments, timezone: settings.timezone, today: localDate(new Date(), settings.timezone), canRecordPayments: hasPermission(session.role, "recordPayments"), defaultTaxRatePercent: settings.defaultTaxRatePercent, invoiceDueDays: settings.invoiceDueDays };
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) notFound();
    logger.error("INVOICES", "Detail failed", error);
    throw new Error("We couldn’t load this invoice. Please try again.");
  }
}
