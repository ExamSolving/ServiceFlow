export class PaymentAccessError extends Error {
  constructor() { super("Payment access denied"); this.name = "PaymentAccessError"; }
}
export class PaymentNotFoundError extends Error {
  constructor() { super("Payment not found"); this.name = "PaymentNotFoundError"; }
}
export class PaymentConflictError extends Error {
  constructor() { super("Payment request was already used with different details"); this.name = "PaymentConflictError"; }
}
export type PaymentRule = "INVOICE_NOT_OPEN" | "EXCEEDS_BALANCE";
export class PaymentRuleError extends Error {
  constructor(public readonly rule: PaymentRule) { super(`Payment rule violated: ${rule}`); this.name = "PaymentRuleError"; }
}
export class PaymentCursorError extends Error {
  constructor() { super("Payment page is no longer available"); this.name = "PaymentCursorError"; }
}
