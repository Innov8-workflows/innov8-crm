// Shared by the Celebrations layer, the Sales Target block and the top-bar toggle.
// Browser-safe: the sales target types are type-only imports, so the database stays
// out of the bundle.
import type { MonthResult, SalesTargetResponse } from "@/lib/salesTargets";

export interface Moment {
  month: string;
  amount: number;
  record: boolean;                  // better than every earlier month
  run: number;                      // months in a row, this one included
}

export const CELEBRATE_EVENT = "crm:celebrate";
export const SEASONAL_EVENT = "crm:seasonal";
export const PREVIEW_EVENT = "crm:preview";
export const WIN_EVENT = "crm:client-won";
const SEASONAL_KEY = "crm_seasonal";
const SOUNDS_KEY = "crm_sounds";
export const MILESTONE_KEY = "crm_mrr_milestone";

// Monthly recurring revenue landmarks. Each gets one big celebration.
const MILESTONES = [7500, 10000, 15000, 20000, 30000, 40000, 50000, 75000, 100000];

export const PREVIEWS: [string, string][] = [
  ["win", "New client"], ["milestone", "Revenue milestone"], ["target", "Target hit"], ["record", "Record month"], ["snow", "Snow"], ["bonfire", "Bonfire Night"],
  ["christmas", "Christmas"], ["xmasday", "Christmas Day"], ["newyear", "New Year"],
  ["valentines", "Valentine's"], ["easter", "Easter"], ["halloween", "Halloween"],
];

export const celebratedKey = (month: string) => `crm_celebrated_${month}`;

/** A month's celebration, or null if it didn't hit. A running month counts as soon as
 *  it reaches the target, which is why this can't use MonthResult.hit. */
export function momentFor(data: SalesTargetResponse, view: MonthResult = data.current): Moment | null {
  if (!view.target || view.new_mrr < view.target.new_mrr) return null;
  const earlier = data.history.filter((h) => h.month < view.month).map((h) => h.new_mrr);
  return {
    month: view.month,
    amount: view.new_mrr,
    record: earlier.length > 0 && view.new_mrr > Math.max(...earlier),
    run: view.month === data.month ? data.streak + 1 : 1,
  };
}

/** The highest landmark at or below this MRR, or 0 if it hasn't reached the first. */
export const milestoneAt = (mrr: number) => MILESTONES.filter((m) => m <= mrr).pop() ?? 0;

/** Seasonal effects, on unless switched off on this device. */
export function seasonalOn(): boolean {
  try { return localStorage.getItem(SEASONAL_KEY) !== "0"; } catch { return true; }
}

/** Celebration sounds, also per device. Same event, so the menu updates for both. */
export function soundsOn(): boolean {
  try { return localStorage.getItem(SOUNDS_KEY) !== "0"; } catch { return true; }
}

export function setSounds(on: boolean) {
  try { localStorage.setItem(SOUNDS_KEY, on ? "1" : "0"); } catch {}
  window.dispatchEvent(new Event(SEASONAL_EVENT));
}

export function setSeasonal(on: boolean) {
  try { localStorage.setItem(SEASONAL_KEY, on ? "1" : "0"); } catch {}
  window.dispatchEvent(new Event(SEASONAL_EVENT));
}
