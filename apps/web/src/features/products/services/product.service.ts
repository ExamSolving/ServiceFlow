import "server-only";

import { notFound } from "next/navigation";

import { requirePermission } from "@/src/lib/auth/authorization";
import { logger } from "@/src/lib/observability/logger";
import { readWorkspaceDefaults } from "@/src/features/workspace-settings/repositories/workspace-settings.repository";
import { ProductCursorError, ProductNotFoundError } from "../repositories/product-errors";
import { listLowStockProducts, listProducts, listRecentMovementsForProduct, listStockMovements, readProduct } from "../repositories/product.repository";
import { productIdSchema, productListFiltersSchema, stockMovementListFiltersSchema } from "../schemas/product.schema";
import type { ProductContext, ProductDetail, ProductListData, ProductSearchParams, StockLedgerData } from "../types/product";

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function getProductsPage(rawSearchParams: ProductSearchParams = {}): Promise<ProductListData> {
  const session = await requirePermission("manageInventory");
  const parsed = productListFiltersSchema.safeParse({ q: single(rawSearchParams.q), status: single(rawSearchParams.status), stock: single(rawSearchParams.stock), cursor: single(rawSearchParams.cursor) });
  if (!parsed.success) return { products: [], filters: { q: "", status: "ALL", stock: "ALL" }, nextCursor: null, filterError: "These filters are invalid. Clear them and try again." };
  try {
    return await listProducts(session, parsed.data);
  } catch (error) {
    if (error instanceof ProductCursorError) return { products: [], filters: parsed.data, nextCursor: null, filterError: "This page is no longer available. Return to the first page to continue." };
    logger.error("PRODUCTS", "List failed", error);
    throw new Error("We couldn’t load products. Please try again.");
  }
}

export async function getProduct(productId: string): Promise<ProductDetail> {
  const session = await requirePermission("manageInventory");
  try {
    return await readProduct(session, productId);
  } catch (error) {
    if (error instanceof ProductNotFoundError) notFound();
    logger.error("PRODUCTS", "Detail failed", error);
    throw new Error("We couldn’t load this product. Please try again.");
  }
}

export async function getProductContext(productId: string): Promise<ProductContext> {
  const session = await requirePermission("manageInventory");
  try {
    const product = await readProduct(session, productId);
    const [movements, defaults] = await Promise.all([listRecentMovementsForProduct(session, product.id), readWorkspaceDefaults(session.organizationId)]);
    return { product, movements, currency: defaults.currency, defaultTaxRatePercent: defaults.defaultTaxRatePercent };
  } catch (error) {
    if (error instanceof ProductNotFoundError) notFound();
    logger.error("PRODUCTS", "Context failed", error);
    throw new Error("We couldn’t load this product. Please try again.");
  }
}

export async function getStockLedger(rawSearchParams: ProductSearchParams = {}): Promise<StockLedgerData> {
  const session = await requirePermission("manageInventory");
  const parsed = stockMovementListFiltersSchema.safeParse({ productId: single(rawSearchParams.productId), type: single(rawSearchParams.type), cursor: single(rawSearchParams.cursor) });
  const empty = (filters: StockLedgerData["filters"], filterError: string): StockLedgerData => ({ movements: [], filters, nextCursor: null, lowStock: [], product: null, filterError });
  if (!parsed.success) return empty({ type: "ALL" }, "These filters are invalid. Clear them and try again.");
  try {
    const [ledger, lowStock, product] = await Promise.all([
      listStockMovements(session, parsed.data),
      listLowStockProducts(session),
      parsed.data.productId ? readProduct(session, parsed.data.productId).catch((error: unknown) => { if (error instanceof ProductNotFoundError) return null; throw error; }) : Promise.resolve(null),
    ]);
    return { ...ledger, lowStock, product };
  } catch (error) {
    if (error instanceof ProductCursorError) return empty(parsed.data, "This page is no longer available. Return to the first page to continue.");
    logger.error("PRODUCTS", "Stock ledger failed", error);
    throw new Error("We couldn’t load stock movements. Please try again.");
  }
}

export function parseProductId(value: string | undefined): string | null {
  const parsed = productIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
