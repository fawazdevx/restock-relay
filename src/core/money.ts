export function sumKobo(values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

export function multiplyKobo(unitPriceKobo: string, quantity: number): string {
  return (BigInt(unitPriceKobo) * BigInt(quantity)).toString();
}

export function formatNaira(koboValue: string, decimals = false): string {
  const value = BigInt(koboValue);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const naira = absolute / 100n;
  const kobo = (absolute % 100n).toString().padStart(2, "0");
  const grouped = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}₦${grouped}${decimals && kobo !== "00" ? `.${kobo}` : ""}`;
}

export function sumNumbers(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
