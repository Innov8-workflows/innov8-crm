// Jay's weekly schedule — full time on the business (no day job).
//
// The shape of the day: mornings fulfil and fill the pipe (Meet calls, client
// work, 30 Facebook outreach messages), the middle of the day is protected for
// gym and food, the afternoon films and builds content, and the late afternoon
// is the phone block — which lands on the 4:30-6pm window that Pricing → Best
// Times to Call rates as one of the two best of the day for trades.
//
// Slots are hardcoded — edit this file to tweak the structure. Completion state
// is stored in DB per (slot_id, date), so changing a slot's TIME or COPY keeps
// its history; changing its `id` starts it fresh.

import type { IconName } from "@/components/Icon";

export type Activity =
  | "meet_call"
  | "fulfilment"
  | "fb_messenger"
  | "gym"
  | "meal"
  | "filming"
  | "content"
  | "prospect_calls"
  | "systems"
  | "learning"
  | "onboarding"
  | "admin";

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface ScheduleSlot {
  id: string;
  day: Day;
  start: string;
  end: string;
  activity: Activity;
  title: string;
  rationale: string;
  target?: { count: number };
  mobile?: boolean;
  protectedRest?: boolean; // hard rest blocks — counted but greyed out
}

export const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DAY_LABELS: Record<Day, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

// `unit` is the noun shown after a slot's target ("Target: 30 msgs"). It lives
// here rather than in a ternary chain in the component, so adding an activity
// can't silently render a target with no unit.
export const ACTIVITY_META: Record<Activity, { label: string; icon: IconName; color: string; unit?: string }> = {
  meet_call:      { label: "Google Meet",     icon: "users",        color: "#3b82f6" },
  fulfilment:     { label: "Fulfilment",      icon: "rocket",       color: "#059669" },
  fb_messenger:   { label: "FB Outreach",     icon: "chat",         color: "#8b5cf6", unit: "businesses" },
  gym:            { label: "Gym",             icon: "dumbbell",     color: "#dc2626" },
  meal:           { label: "Food",            icon: "utensils",     color: "#84cc16" },
  filming:        { label: "Filming",         icon: "camera",       color: "#f59e0b", unit: "videos" },
  content:        { label: "Content",         icon: "brush",        color: "#ec4899", unit: "videos" },
  prospect_calls: { label: "Prospect Calls",  icon: "phone",        color: "#ea580c", unit: "calls" },
  systems:        { label: "Systems / SOPs",  icon: "wrench",       color: "#f97316" },
  learning:       { label: "Research",        icon: "book",         color: "#0ea5e9" },
  onboarding:     { label: "Onboarding",      icon: "check-circle", color: "#22c55e", unit: "session" },
  admin:          { label: "Admin / Rest",    icon: "cog",          color: "#9ca3af" },
};

// Headline targets used by the progress strip.
// Sum of all `target.count` for a given activity MUST equal these, or the bar
// can never reach 100%.
export const WEEKLY_TARGETS: Partial<Record<Activity, number>> = {
  fb_messenger:   150, // 30 businesses/day Mon-Fri
  prospect_calls: 75,  // 15/day Mon-Fri across the 15:30-18:00 block
  content:        15,  // 3 videos/day Mon-Fri (top of the stated 2-3 range)
  filming:        10,  // 2 yap videos/day Mon-Fri (Innov8 + Agency)
};

// The full-time weekday shape. Mon-Fri are identical, so they're generated from
// one definition rather than copy-pasted five times — that's how the old version
// drifted (five near-identical blocks each needing the same edit).
//
// Slot IDs are `<day>-<key>` and stable: editing a slot's time or copy keeps its
// completion history, changing its id starts it fresh.
const WEEKDAY_SHAPE: Omit<ScheduleSlot, "id" | "day">[] = [
  {
    start: "09:00", end: "09:45", activity: "meet_call",
    title: "Google Meet calls",
    rationale: "Booked calls first, while you're sharp and before the day gets away from you. Discovery calls, client check-ins, anything that needs a face.",
  },
  {
    start: "09:45", end: "10:45", activity: "fulfilment",
    title: "Fulfilment — client work",
    rationale: "Live client work: site builds, edits, SEO passes, whatever's owed this week. Doing it in the morning means it never eats the outreach block.",
  },
  {
    start: "10:45", end: "11:30", activity: "fb_messenger",
    title: "Facebook outreach", target: { count: 30 },
    rationale: "30 businesses, personalised — a specific hook each time (their reviews, a problem on their page, a competitor). This is the number that feeds every call and demo later in the week; if it slips, the pipeline goes quiet 10 days from now.",
  },
  {
    start: "11:30", end: "13:00", activity: "gym",
    title: "Gym",
    rationale: "1-1.5hr. Full time removes the excuse — this is the block that keeps the 3.30-6pm phone session sounding energetic rather than flat.",
  },
  {
    start: "13:00", end: "13:30", activity: "meal",
    title: "Lunch — proper food",
    rationale: "Actual healthy food, away from the desk. The afternoon is filming and phones; both are noticeably worse on a skipped lunch.",
  },
  {
    start: "13:30", end: "14:00", activity: "filming",
    title: "Post-lunch walk + film yap videos", target: { count: 2 },
    rationale: "Walk and talk: one for Innov8 Workflows, one for the Agency. Talking-head content is easiest outdoors mid-walk when you're warmed up and not staring down a lens in a quiet room.",
  },
  {
    start: "14:00", end: "15:30", activity: "content",
    title: "Create content", target: { count: 3 },
    rationale: "2-3 videos edited and queued, ready to post through the evening. Batch it here so posting later is a 30-second job, not a second work session.",
  },
  {
    start: "15:30", end: "18:00", activity: "prospect_calls",
    title: "Warm + cold prospect calls", target: { count: 15 },
    rationale: "The money block. Warm follow-ups first (anyone who replied to outreach or watched a demo), then cold. Runs straight into the 4:30-6pm window that Pricing → Best Times to Call rates as one of the two best of the day — they're wrapping up, driving home, in admin mode.",
  },
  {
    start: "19:00", end: "19:15", activity: "content",
    title: "Post today's videos",
    rationale: "Push the batch out across both accounts. Fifteen minutes, no editing, no rabbit holes — then the laptop shuts.",
  },
  {
    start: "19:15", end: "23:00", activity: "admin",
    title: "STOP — evening protected", protectedRest: true,
    rationale: "Hard stop. Full time means the work fits in the working day; evenings are how you keep doing this in six months.",
  },
];

const WEEKDAY_KEYS = ["meet", "fulfil", "outreach", "gym", "lunch", "film", "content", "calls", "post", "rest"];

const WEEKDAYS: Day[] = ["mon", "tue", "wed", "thu", "fri"];

export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  ...WEEKDAYS.flatMap((day) =>
    WEEKDAY_SHAPE.map((slot, i) => ({ ...slot, id: `${day}-${WEEKDAY_KEYS[i]}`, day }))
  ),

  // ═════════════ WEEKEND ═════════════
  // One flexible block a day rather than a timetable — it's a working weekend by
  // choice, not a rota, and unticked boxes on a Sunday are just nagging.
  {
    id: "sat-block", day: "sat", start: "10:00", end: "14:00", activity: "systems",
    title: "Fulfilment · research · systems",
    rationale: "Catch-up and sharpen: finish any client work owed, research (competitors, offers, sales), and improve the internal systems — CRM, skills, templates, SOPs. The 'work on the business' block.",
  },
  {
    id: "sat-rest", day: "sat", start: "14:00", end: "23:00", activity: "admin",
    title: "STOP — rest of Saturday protected", protectedRest: true,
    rationale: "Hard stop at 2pm. Weekends are a half-day at most.",
  },
  {
    id: "sun-block", day: "sun", start: "10:00", end: "14:00", activity: "systems",
    title: "Fulfilment · research · systems",
    rationale: "Same shape as Saturday. If the week's fulfilment is clear, spend the whole block on systems and research — that's what compounds.",
  },
  {
    id: "sun-rest", day: "sun", start: "14:00", end: "23:00", activity: "admin",
    title: "STOP — reset for Monday", protectedRest: true,
    rationale: "Hard stop. Sleep and a clear head beat a fifth hour of tinkering.",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────

/** Format Date → YYYY-MM-DD using LOCAL date parts. Avoids UTC roundtripping
 *  that caused dates to drift back 1 day under BST (local midnight = UTC-1h). */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns Monday's YYYY-MM-DD for the week containing the given date. */
export function mondayOfWeek(d: Date = new Date()): string {
  const day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  return toLocalISODate(monday);
}

/** Date string (YYYY-MM-DD) for nth day after a given Monday string. */
export function dateForDayOffset(monday: string, dayOffset: number): string {
  const [y, m, dd] = monday.split("-").map(Number);
  // Build a local date with no time component — pure date arithmetic
  const d = new Date(y, m - 1, dd + dayOffset);
  return toLocalISODate(d);
}

/** Day-of-week index (0=Mon, 6=Sun) for a Day enum. */
export const DAY_INDEX: Record<Day, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/** "Today" as a Day enum, or null on Sunday→Monday boundary edge. */
export function todayAsDay(): Day | null {
  const idx = new Date().getDay(); // 0=Sun..6=Sat
  const mapping: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return mapping[idx] || null;
}
