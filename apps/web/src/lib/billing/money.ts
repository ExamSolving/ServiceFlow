/**
 * Money is stored as decimal numbers with two places and computed in integer
 * minor units so sums never drift. Currency codes come from workspace settings.
 */
export const toMinor = (amount: number) => Math.round(amount * 100);
export const fromMinor = (minor: number) => minor / 100;

export function roundMoney(amount: number): number {
  return fromMinor(toMinor(amount));
}

/** True when the amount has at most two decimal places and is finite. */
export function isMoney(amount: number): boolean {
  return Number.isFinite(amount) && Math.abs(toMinor(amount) - amount * 100) < 1e-6;
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function formatMoney(amount: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: ZERO_DECIMAL.has(currency) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
