export class ProductAccessError extends Error {
  constructor() { super("Product access denied"); this.name = "ProductAccessError"; }
}
export class ProductNotFoundError extends Error {
  constructor() { super("Product not found"); this.name = "ProductNotFoundError"; }
}
export class ProductConflictError extends Error {
  constructor() { super("Product has changed or this request was already used"); this.name = "ProductConflictError"; }
}
export class ProductDuplicateSkuError extends Error {
  constructor() { super("Product SKU is already used"); this.name = "ProductDuplicateSkuError"; }
}
export class ProductCursorError extends Error {
  constructor() { super("Product page is no longer available"); this.name = "ProductCursorError"; }
}
export type StockRule = "NOT_TRACKED" | "INACTIVE" | "INSUFFICIENT_STOCK" | "LIMIT" | "FRACTIONAL_QUANTITY";
export class StockRuleError extends Error {
  constructor(public readonly rule: StockRule, public readonly productName?: string) {
    super(`Stock rule violated: ${rule}`); this.name = "StockRuleError";
  }
}
