export class MemberAccessError extends Error {
  constructor() { super("Team access denied"); this.name = "MemberAccessError"; }
}
export class MemberNotFoundError extends Error {
  constructor() { super("Team member not found"); this.name = "MemberNotFoundError"; }
}
export class MemberConflictError extends Error {
  constructor() { super("Team member has changed or this request was already used"); this.name = "MemberConflictError"; }
}
export class MemberRuleError extends Error {
  readonly code: "OWNER_PROTECTED" | "SELF_CHANGE" | "ALREADY_MEMBER" | "INVITATION_PENDING" | "MEMBER_SUSPENDED";
  constructor(code: MemberRuleError["code"]) {
    super(`Team rule violated: ${code}`);
    this.name = "MemberRuleError";
    this.code = code;
  }
}
export class InvitationNotFoundError extends Error {
  constructor() { super("Invitation not found"); this.name = "InvitationNotFoundError"; }
}
export class InvitationStateError extends Error {
  readonly code: "EXPIRED" | "REVOKED" | "ACCEPTED" | "EMAIL_MISMATCH";
  constructor(code: InvitationStateError["code"]) {
    super(`Invitation cannot be used: ${code}`);
    this.name = "InvitationStateError";
    this.code = code;
  }
}
