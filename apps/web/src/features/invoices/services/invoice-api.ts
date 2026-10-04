import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import type { AppSession } from "@/src/features/auth/types/app-session";
import { BillingReferenceError } from "@/src/features/billing/repositories/billing-references";
import { ProductNotFoundError, StockRuleError } from "@/src/features/products/repositories/product-errors";
import { stockRuleMessage } from "@/src/features/products/services/product-api";
import { QuotationConflictError, QuotationNotFoundError, QuotationRuleError, QuotationStateError } from "@/src/features/quotations/repositories/quotation-errors";
import { getApiSession } from "@/src/lib/http/api-session";
import { jsonError, parseJsonBody } from "@/src/lib/http/json";
import { isSameOrigin } from "@/src/lib/http/same-origin";
import { logger } from "@/src/lib/observability/logger";
import { InvoiceAccessError, InvoiceConflictError, InvoiceNotFoundError, InvoiceRuleError, InvoiceStateError } from "../repositories/invoice-errors";
import type { InvoiceDetail } from "../types/invoice";

export function invoiceMutationError(error: unknown) {
  if (error instanceof InvoiceAccessError) return jsonError("You don’t have permission to manage invoices.", 403);
  if (error instanceof InvoiceNotFoundError) return jsonError("This invoice is unavailable in your workspace.", 404);
  if (error instanceof InvoiceConflictError) return jsonError("This invoice changed or was already saved. Review the latest version before trying again.", 409, { code: "CONFLICT" });
  if (error instanceof InvoiceStateError) return jsonError("This invoice’s status no longer allows this action. Refresh to view its latest state.", 409, { code: "STATE" });
  if (error instanceof InvoiceRuleError) return jsonError(error.rule === "JOB_NOT_COMPLETED" ? "The linked job must be completed before this invoice can be issued." : "This invoice has payments recorded and cannot be voided.", 409, { code: "RULE", rule: error.rule });
  if (error instanceof StockRuleError) return jsonError(stockRuleMessage(error), 409, { code: "STOCK_RULE", rule: error.rule });
  if (error instanceof ProductNotFoundError) return jsonError("A line item refers to a product that is no longer in your catalog. Edit the invoice before issuing it.", 409, { code: "INVALID_REFERENCE" });
  if (error instanceof BillingReferenceError) return jsonError(error.reference === "CUSTOMER_MISMATCH" ? "The linked job belongs to a different customer." : error.reference === "JOB" ? "The linked job could not be found in your workspace." : "Choose an active customer from your workspace.", 409, { code: "INVALID_REFERENCE" });
  if (error instanceof QuotationNotFoundError) return jsonError("This quotation is unavailable in your workspace.", 404);
  if (error instanceof QuotationConflictError) return jsonError("This quotation changed since you opened it. Refresh and try again.", 409, { code: "CONFLICT" });
  if (error instanceof QuotationStateError) return jsonError("Only approved quotations can be converted to invoices.", 409, { code: "STATE" });
  if (error instanceof QuotationRuleError) return jsonError("This quotation has already been converted to an invoice.", 409, { code: "RULE", rule: error.rule });
  logger.error("INVOICES", "Mutation failed", error);
  return jsonError("We couldn’t save the invoice. Please try again.", 500);
}

export function revalidateInvoice(invoice: Pick<InvoiceDetail, "id" | "jobId" | "quotationId">) {
  for (const path of ["/protected/invoices", `/protected/invoices/${invoice.id}`, `/protected/invoices/${invoice.id}/edit`, "/protected/payments", "/protected/inventory/products", "/protected/inventory/stock", "/protected/dashboard"]) revalidatePath(path);
  if (invoice.jobId) revalidatePath(`/protected/jobs/${invoice.jobId}`);
  if (invoice.quotationId) revalidatePath(`/protected/quotations/${invoice.quotationId}`);
}

export async function mutateInvoice<T>(request: NextRequest, schema: z.ZodType<T>, save: (session: AppSession, data: T) => Promise<InvoiceDetail>, status = 200) {
  if (!isSameOrigin(request)) return jsonError("Request could not be verified.", 403);
  const auth = await getApiSession("manageInvoices", "You don’t have permission to manage invoices.");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody(request, schema, { maxBytes: 65_536, resource: "invoice" });
  if (!parsed.success) return parsed.response;
  try {
    const invoice = await save(auth.session, parsed.data);
    revalidateInvoice(invoice);
    return NextResponse.json({ invoice }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return invoiceMutationError(error);
  }
}
