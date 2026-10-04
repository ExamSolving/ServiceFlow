import type { InvoiceDetail } from "@/src/features/invoices/types/invoice";
import type { QuotationDetail } from "@/src/features/quotations/types/quotation";

export interface JobBilling {
  quotations: QuotationDetail[];
  invoices: InvoiceDetail[];
  canQuote: boolean;
  canInvoice: boolean;
  unavailable: boolean;
}
