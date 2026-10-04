import type { BaseEntity } from "./common";

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "OTHER";

export interface Payment extends BaseEntity {
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  paidAt: Date;
  reference?: string;
  notes?: string;
  recordedBy: string;
}
