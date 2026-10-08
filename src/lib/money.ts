// £ formatting for every money figure in the CRM: thousands separators, and pence
// only when there are any (£4,420 · £1,234.50). Browser-safe — no server imports.

export function gbp(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return "£" + v.toLocaleString("en-GB", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}
