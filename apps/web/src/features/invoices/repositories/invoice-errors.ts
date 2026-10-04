export class InvoiceAccessError extends Error {
  constructor() { super("Invoice access denied"); this.name = "InvoiceAccessError"; }
}
export class InvoiceNotFoundError extends Error {
  constructor() { super("Invoice not found"); this.name = "InvoiceNotFoundError"; }
}
export class InvoiceConflictError extends Error {
  constructor() { super("Invoice has changed or this request was already used"); this.name = "InvoiceConflictError"; }
}
export class InvoiceStateError extends Error {
  constructor() { super("Invoice status does not allow this action"); this.name = "InvoiceStateError"; }
}
export type InvoiceRule = "JOB_NOT_COMPLETED" | "HAS_PAYMENTS";
export class InvoiceRuleError extends Error {
  constructor(public readonly rule: InvoiceRule) { super(`Invoice rule violated: ${rule}`); this.name = "InvoiceRuleError"; }
}
export class InvoiceCursorError extends Error {
  constructor() { super("Invoice page is no longer available"); this.name = "InvoiceCursorError"; }
}
