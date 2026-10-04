import type { StockMovementType } from "../schemas/product.schema";

export type { StockMovementType };
export type StockMovementSource = "MANUAL" | "INVOICE_ISSUED" | "INVOICE_VOIDED";

export interface ProductFormValues {
  name: string;
  sku: string;
  description: string;
  unit: string;
  unitPrice: number;
  taxRatePercent: number | null;
  trackStock: boolean;
  reorderLevel: number;
  isActive: boolean;
}

export interface ProductDetail extends ProductFormValues {
  id: string;
  quantityOnHand: number;
  lowStock: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListFilters { q: string; status: "ALL" | "ACTIVE" | "INACTIVE"; stock: "ALL" | "TRACKED" | "LOW"; cursor?: string }
export interface ProductListData { products: ProductDetail[]; filters: ProductListFilters; nextCursor: string | null; filterError?: string }
export interface ProductOption { id: string; name: string; secondary?: string; unitPrice: number; taxRatePercent: number | null; unit: string }
export interface ProductOptions { options: ProductOption[]; nextCursor: string | null }

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: StockMovementType;
  source: StockMovementSource;
  quantity: number;
  quantityDelta: number;
  quantityAfter: number;
  reason: string;
  reference: string;
  invoiceId: string | null;
  createdByName: string;
  createdAt: string;
}

export interface StockMovementListFilters { productId?: string; type: "ALL" | StockMovementType; cursor?: string }
export interface StockLedgerData {
  movements: StockMovement[];
  filters: StockMovementListFilters;
  nextCursor: string | null;
  lowStock: ProductDetail[];
  product: ProductDetail | null;
  filterError?: string;
}
export interface ProductContext { product: ProductDetail; movements: StockMovement[]; currency: string; defaultTaxRatePercent: number }
export type ProductSearchParams = Record<string, string | string[] | undefined>;
