// Which seasonal effect the CRM shows on a given UK day. Pure and browser-safe, like
// dateRange.ts. Days are 'YYYY-MM-DD' from ukToday(), so plain string comparison works.

export type Season = "bonfire" | "christmas" | "xmasday" | "newyear" | "valentines" | "easter" | "halloween";

const shiftDay = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Easter Sunday by the Anonymous Gregorian algorithm. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const date = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

export function seasonFor(day: string): Season | null {
  const md = day.slice(5);
  if (md === "12-25") return "xmasday";
  if (md >= "12-01" && md <= "12-26") return "christmas";
  if (md === "12-31" || md === "01-01") return "newyear";
  if (md >= "02-12" && md <= "02-14") return "valentines";
  if (md >= "10-28" && md <= "10-31") return "halloween";
  if (md >= "11-03" && md <= "11-05") return "bonfire";
  const easter = easterSunday(Number(day.slice(0, 4)));
  if (day >= shiftDay(easter, -7) && day <= shiftDay(easter, 1)) return "easter";  // Palm Sunday to Easter Monday
  return null;
}
