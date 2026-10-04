import { Badge } from "@/components/ui/badge";
import { invoiceStatusLabel, invoiceStatusVariant, quotationStatusLabel, quotationStatusVariant, type InvoiceStatus, type QuotationStatus } from "./billing-format";

export function QuotationStatusBadge({ status, expired = false }: { status: QuotationStatus; expired?: boolean }) {
  if (status === "SENT" && expired) return <Badge variant="attention">Sent · past validity</Badge>;
  return <Badge variant={quotationStatusVariant(status)}>{quotationStatusLabel(status)}</Badge>;
}

export function InvoiceStatusBadge({ status, overdue = false }: { status: InvoiceStatus; overdue?: boolean }) {
  if (overdue && (status === "ISSUED" || status === "PARTIALLY_PAID")) return <Badge variant="destructive">{invoiceStatusLabel(status)} · overdue</Badge>;
  return <Badge variant={invoiceStatusVariant(status)}>{invoiceStatusLabel(status)}</Badge>;
}
