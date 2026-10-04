/**
 * Minimal structured logger. Server code should log through this module so
 * identifiers can be redacted in production and output stays greppable.
 */
type Fields = Record<string, unknown>;

const SENSITIVE_KEYS = new Set(["uid", "userId", "actorUserId", "email", "membershipId", "token", "idToken", "cookie"]);
const production = typeof process !== "undefined" && process.env.NODE_ENV === "production";

function redact(fields: Fields | undefined): Fields | undefined {
  if (!fields) return undefined;
  if (!production) return fields;
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, SENSITIVE_KEYS.has(key) && typeof value === "string" ? `${value.slice(0, 4)}…` : value]));
}

function line(level: string, scope: string, message: string, fields?: Fields) {
  const safe = redact(fields);
  return safe && Object.keys(safe).length ? `[${scope}] ${message} ${JSON.stringify(safe)}` : `[${scope}] ${message}`;
}

export const logger = {
  debug(scope: string, message: string, fields?: Fields) {
    if (!production) console.debug(line("debug", scope, message, fields));
  },
  info(scope: string, message: string, fields?: Fields) {
    console.info(line("info", scope, message, fields));
  },
  warn(scope: string, message: string, fields?: Fields) {
    console.warn(line("warn", scope, message, fields));
  },
  error(scope: string, message: string, error?: unknown, fields?: Fields) {
    const detail = error instanceof Error ? { error: error.message, ...(production ? {} : { stack: error.stack }) } : error === undefined ? {} : { error: String(error) };
    console.error(line("error", scope, message, { ...(fields ?? {}), ...detail }));
  },
};
