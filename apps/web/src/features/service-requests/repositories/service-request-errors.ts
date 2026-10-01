export class ServiceRequestAccessError extends Error {
  constructor() { super("Service request access denied"); this.name = "ServiceRequestAccessError"; }
}

export class ServiceRequestNotFoundError extends Error {
  constructor() { super("Service request not found"); this.name = "ServiceRequestNotFoundError"; }
}

export class ServiceRequestConflictError extends Error {
  constructor() { super("Service request has changed or this request was already used"); this.name = "ServiceRequestConflictError"; }
}

export class ServiceRequestCursorError extends Error {
  constructor() { super("Service request page is no longer available"); this.name = "ServiceRequestCursorError"; }
}

export type ServiceRequestReferenceField = "customerId" | "serviceTypeId";

export class ServiceRequestReferenceError extends Error {
  readonly field: ServiceRequestReferenceField;
  constructor(field: ServiceRequestReferenceField) {
    super(`Service request ${field} must reference an active record in this workspace`);
    this.name = "ServiceRequestReferenceError";
    this.field = field;
  }
}

export class ServiceRequestTransitionError extends Error {
  constructor() { super("Service request status change is not allowed"); this.name = "ServiceRequestTransitionError"; }
}
