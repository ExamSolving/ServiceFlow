import type { BadgeVariant } from "@/components/ui/badge";

export type QuotationStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED";
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "OTHER";

const QUOTATION_LABELS: Record<QuotationStatus, string> = { DRAFT: "Draft", SENT: "Sent", APPROVED: "Approved", REJECTED: "Rejected", EXPIRED: "Expired" };
const INVOICE_LABELS: Record<InvoiceStatus, string> = { DRAFT: "Draft", ISSUED: "Issued", PARTIALLY_PAID: "Partially paid", PAID: "Paid", VOID: "Void" };
const METHOD_LABELS: Record<PaymentMethod, string> = { CASH: "Cash", CARD: "Card", BANK_TRANSFER: "Bank transfer", UPI: "UPI", CHEQUE: "Cheque", OTHER: "Other" };

export const quotationStatusLabel = (status: QuotationStatus) => QUOTATION_LABELS[status];
export const invoiceStatusLabel = (status: InvoiceStatus) => INVOICE_LABELS[status];
export const paymentMethodLabel = (method: PaymentMethod) => METHOD_LABELS[method];
export const paymentMethodOptions = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((value) => ({ value, label: METHOD_LABELS[value] }));

export function quotationStatusVariant(status: QuotationStatus): BadgeVariant {
  if (status === "APPROVED") return "positive";
  if (status === "SENT") return "info";
  if (status === "REJECTED") return "destructive";
  if (status === "EXPIRED") return "attention";
  return "neutral";
}
export function invoiceStatusVariant(status: InvoiceStatus): BadgeVariant {
  if (status === "PAID") return "positive";
  if (status === "ISSUED") return "info";
  if (status === "PARTIALLY_PAID") return "attention";
  if (status === "VOID") return "destructive";
  return "neutral";
}

/** Calendar dates (YYYY-MM-DD) are shown as-is, without timezone shifting. */
export function formatCalendarDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
export const formatBillingDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
export function formatBillingDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export const formatPercent = (value: number) => `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}%`;
export const formatQuantity = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(value);
