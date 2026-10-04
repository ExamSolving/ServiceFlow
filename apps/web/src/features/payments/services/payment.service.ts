import "server-only";

import { readBillingSettings } from "@/src/features/billing/repositories/billing-settings";
import { requirePermission } from "@/src/lib/auth/authorization";
import { logger } from "@/src/lib/observability/logger";
import { PaymentCursorError } from "../repositories/payment-errors";
import { listPayments } from "../repositories/payment.repository";
import { paymentListFiltersSchema } from "../schemas/payment.schema";
import type { PaymentListData, PaymentSearchParams } from "../types/payment";

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function getPaymentsPage(rawSearchParams: PaymentSearchParams = {}): Promise<PaymentListData> {
  const session = await requirePermission("recordPayments");
  const settings = await readBillingSettings(session.organizationId);
  const parsed = paymentListFiltersSchema.safeParse({ method: single(rawSearchParams.method), invoiceId: single(rawSearchParams.invoiceId), cursor: single(rawSearchParams.cursor) });
  if (!parsed.success) return { payments: [], filters: { method: "ALL" }, nextCursor: null, timezone: settings.timezone, filterError: "These filters are invalid. Clear them and try again." };
  try {
    return { ...(await listPayments(session, parsed.data)), timezone: settings.timezone };
  } catch (error) {
    if (error instanceof PaymentCursorError) return { payments: [], filters: parsed.data, nextCursor: null, timezone: settings.timezone, filterError: "This page is no longer available. Return to the first page to continue." };
    logger.error("PAYMENTS", "List failed", error);
    throw new Error("We couldn’t load payments. Please try again.");
  }
}
