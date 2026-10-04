export class QuotationAccessError extends Error {
  constructor() { super("Quotation access denied"); this.name = "QuotationAccessError"; }
}
export class QuotationNotFoundError extends Error {
  constructor() { super("Quotation not found"); this.name = "QuotationNotFoundError"; }
}
export class QuotationConflictError extends Error {
  constructor() { super("Quotation has changed or this request was already used"); this.name = "QuotationConflictError"; }
}
export class QuotationStateError extends Error {
  constructor() { super("Quotation status does not allow this action"); this.name = "QuotationStateError"; }
}
export type QuotationRule = "JOB_HAS_ACTIVE_QUOTATION" | "ALREADY_CONVERTED";
export class QuotationRuleError extends Error {
  constructor(public readonly rule: QuotationRule) { super(`Quotation rule violated: ${rule}`); this.name = "QuotationRuleError"; }
}
export class QuotationCursorError extends Error {
  constructor() { super("Quotation page is no longer available"); this.name = "QuotationCursorError"; }
}
