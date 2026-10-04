import type { z } from "zod";

import type { invoiceDetailSchema, invoiceStatuses } from "../schemas/invoice.schema";
import type { PaymentDetail } from "@/src/features/payments/types/payment";

export type InvoiceStatus = (typeof invoiceStatuses)[number];
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;
export interface InvoiceListFilters { q: string; status: "ALL" | InvoiceStatus; cursor?: string }
export interface InvoiceListData { invoices: InvoiceDetail[]; filters: InvoiceListFilters; nextCursor: string | null; today: string; filterError?: string }
export interface InvoiceContext {
  invoice: InvoiceDetail;
  payments: PaymentDetail[];
  timezone: string;
  today: string;
  canRecordPayments: boolean;
  defaultTaxRatePercent: number;
  invoiceDueDays: number;
}
export type InvoiceSearchParams = Record<string, string | string[] | undefined>;
