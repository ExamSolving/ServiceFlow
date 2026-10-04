import type { BaseEntity } from "./common";

export type StockMovementType = "IN" | "OUT" | "ADJUST";
export type StockMovementSource = "MANUAL" | "INVOICE_ISSUED" | "INVOICE_VOIDED";

export interface Product extends BaseEntity {
  name: string;
  sku: string;
  description?: string;
  unit: string;
  unitPrice: number;
  /** Null means the organization's default tax rate applies. */
  taxRatePercent: number | null;
  trackStock: boolean;
  quantityOnHand: number;
  reorderLevel: number;
  isActive: boolean;
}

export interface StockMovement extends BaseEntity {
  productId: string;
  type: StockMovementType;
  source: StockMovementSource;
  quantity: number;
  quantityDelta: number;
  quantityAfter: number;
  reason?: string;
  reference?: string;
  invoiceId?: string | null;
  createdBy: string;
}
