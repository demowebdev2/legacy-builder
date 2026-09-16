/**
 * Formats integer cents the way the prototype does: whole dollars without decimals,
 * otherwise two decimals, and a true minus sign for negatives ("−$20").
 */
export function formatMoney(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return "—";
  const abs = Math.abs(cents);
  const digits = abs % 100 ? 2 : 0;
  const text = (abs / 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (cents < 0 ? "−$" : "$") + text;
}

/** Always two decimals — used for per-lead rates ("$26.00 per lead"). */
export function formatRate(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
