export class ServiceTypeAccessError extends Error {
  constructor() { super("Service type access denied"); this.name = "ServiceTypeAccessError"; }
}

export class ServiceTypeNotFoundError extends Error {
  constructor() { super("Service type not found"); this.name = "ServiceTypeNotFoundError"; }
}

export class ServiceTypeConflictError extends Error {
  constructor() { super("Service type has changed or this request was already used"); this.name = "ServiceTypeConflictError"; }
}

export class ServiceTypeDuplicateNameError extends Error {
  constructor() { super("Service type name is already used"); this.name = "ServiceTypeDuplicateNameError"; }
}

export class ServiceTypeCursorError extends Error {
  constructor() { super("Service type page is no longer available"); this.name = "ServiceTypeCursorError"; }
}
