import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { ProductDetail, StockMovementSource, StockMovementType } from "../types/product";

export function ProductStatus({ active }: { active: boolean }) {
  return <Badge variant={active ? "positive" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;
}

export function stockLevel(product: Pick<ProductDetail, "trackStock" | "quantityOnHand" | "lowStock">): { label: string; variant: BadgeVariant } {
  if (!product.trackStock) return { label: "Not tracked", variant: "outline" };
  if (product.quantityOnHand <= 0) return { label: "Out of stock", variant: "destructive" };
  if (product.lowStock) return { label: "Low stock", variant: "attention" };
  return { label: "In stock", variant: "positive" };
}

export function StockBadge({ product }: { product: Pick<ProductDetail, "trackStock" | "quantityOnHand" | "lowStock"> }) {
  const level = stockLevel(product);
  return <Badge variant={level.variant}>{level.label}</Badge>;
}

export function formatQuantity(quantity: number, unit: string) {
  return `${new Intl.NumberFormat("en").format(quantity)} ${unit}`;
}

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = { IN: "Stock in", OUT: "Stock out", ADJUST: "Count adjustment" };
const MOVEMENT_SOURCE_LABELS: Record<StockMovementSource, string> = { MANUAL: "Recorded manually", INVOICE_ISSUED: "Invoice issued", INVOICE_VOIDED: "Invoice voided" };

export const movementTypeLabel = (type: StockMovementType) => MOVEMENT_TYPE_LABELS[type];
export const movementSourceLabel = (source: StockMovementSource) => MOVEMENT_SOURCE_LABELS[source];
export function movementVariant(type: StockMovementType): BadgeVariant {
  return type === "IN" ? "positive" : type === "OUT" ? "info" : "attention";
}
export function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${new Intl.NumberFormat("en").format(delta)}`;
}
export const formatProductDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
export const formatProductDateTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
