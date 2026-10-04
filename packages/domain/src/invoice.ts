import type { BaseEntity } from "./common";
import type { BillingLineItem } from "./quotation";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";

export interface Invoice extends BaseEntity {
  invoiceNumber: string;
  status: InvoiceStatus;
  customerId: string;
  jobId?: string | null;
  quotationId?: string | null;
  title: string;
  notes?: string;
  currency: string;
  lineItems: BillingLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  /** Calendar date (YYYY-MM-DD) in the organization's timezone; set when issued. */
  dueAt: string | null;
  issuedAt?: Date | null;
  paidAt?: Date | null;
  voidedAt?: Date | null;
  createdBy: string;
}
