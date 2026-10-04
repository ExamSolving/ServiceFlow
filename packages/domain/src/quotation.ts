import type { BaseEntity } from "./common";

export type QuotationStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface BillingLineItem {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRatePercent: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface Quotation extends BaseEntity {
  quotationNumber: string;
  status: QuotationStatus;
  customerId: string;
  jobId?: string | null;
  title: string;
  notes?: string;
  currency: string;
  lineItems: BillingLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  /** Calendar date (YYYY-MM-DD) in the organization's timezone. */
  validUntil: string;
  sentAt?: Date | null;
  decidedAt?: Date | null;
  invoiceId?: string | null;
  createdBy: string;
}
