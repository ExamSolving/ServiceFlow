export class TechnicianAccessError extends Error {
  constructor() { super("Technician access denied"); this.name = "TechnicianAccessError"; }
}

export class TechnicianNotFoundError extends Error {
  constructor() { super("Technician not found"); this.name = "TechnicianNotFoundError"; }
}

export class TechnicianConflictError extends Error {
  constructor() { super("Technician has changed or this request was already used"); this.name = "TechnicianConflictError"; }
}

export class TechnicianAlreadyLinkedError extends Error {
  constructor() { super("Member already has a technician profile"); this.name = "TechnicianAlreadyLinkedError"; }
}

export class TechnicianIneligibleMemberError extends Error {
  constructor() { super("Member is no longer eligible for a technician profile"); this.name = "TechnicianIneligibleMemberError"; }
}

export class TechnicianCursorError extends Error {
  constructor() { super("Technician page is no longer available"); this.name = "TechnicianCursorError"; }
}
