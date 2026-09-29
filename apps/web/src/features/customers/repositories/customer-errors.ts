export class CustomerAccessError extends Error {
  constructor() { super("Customer access denied"); this.name = "CustomerAccessError"; }
}

export class CustomerNotFoundError extends Error {
  constructor() { super("Customer not found"); this.name = "CustomerNotFoundError"; }
}

export class CustomerConflictError extends Error {
  constructor() { super("Customer has changed or this request was already used"); this.name = "CustomerConflictError"; }
}

export class CustomerCursorError extends Error {
  constructor() { super("Customer page is no longer available"); this.name = "CustomerCursorError"; }
}
