/**
 * A new request ID (an RFC 4122 version 4 UUID) for a move or note. The server
 * uses it to apply a retried request once, so it must be unique, not secret.
 */
export function newRequestId(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof native?.randomUUID === 'function') return native.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16));
  hex[12] = 4;
  hex[16] = (hex[16] & 0x3) | 0x8;
  const text = hex.map((digit) => digit.toString(16)).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
