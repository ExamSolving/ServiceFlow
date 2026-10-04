import "server-only";

import { jsonError } from "@/src/lib/http/json";
import { logger } from "@/src/lib/observability/logger";
import { ProductAccessError, ProductConflictError, ProductCursorError, ProductDuplicateSkuError, ProductNotFoundError, StockRuleError } from "../repositories/product-errors";

export function stockRuleMessage(error: StockRuleError) {
  const name = error.productName ? `“${error.productName}”` : "This product";
  switch (error.rule) {
    case "INACTIVE": return `${name} is inactive. Reactivate it before recording stock.`;
    case "NOT_TRACKED": return `${name} does not track stock. Turn on stock tracking first.`;
    case "INSUFFICIENT_STOCK": return `${name} does not have enough stock on hand for this quantity.`;
    case "FRACTIONAL_QUANTITY": return `${name} tracks whole units. Use a whole-number quantity.`;
    case "LIMIT": return `${name} would exceed the maximum stock quantity.`;
  }
}

export function productMutationError(error: unknown) {
  if (error instanceof ProductAccessError) return jsonError("You don’t have permission to manage inventory.", 403);
  if (error instanceof ProductNotFoundError) return jsonError("This product could not be found in your workspace.", 404);
  if (error instanceof ProductDuplicateSkuError) return jsonError("This SKU is already used by a product in your workspace. Choose another SKU or edit the existing product.", 409, { code: "DUPLICATE_SKU" });
  if (error instanceof ProductConflictError) return jsonError("This product or request has changed. Review the latest version before trying again.", 409, { code: "CONFLICT" });
  if (error instanceof StockRuleError) return jsonError(stockRuleMessage(error), 409, { code: "STOCK_RULE", rule: error.rule });
  if (error instanceof ProductCursorError) return jsonError("This page of options is no longer available. Search again.", 400, { code: "CURSOR" });
  logger.error("PRODUCTS", "Mutation failed", error);
  return jsonError("We couldn’t save this product. Please try again.", 500);
}
