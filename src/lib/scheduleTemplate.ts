// Jay's burn-the-boats weekly schedule — built around 9-5.30 Mon-Fri day job
// + 1hr dog-walk lunch (12:30-13:30, mobile-only). ~30 hr/week side-hustle push.
//
// Slots are hardcoded — edit this file to tweak the structure. Completion state
// is stored in DB per (slot_id, date).

import type { IconName } from "@/components/Icon";

export type Activity =
  | "cold_calls"
  | "warm_calls"
  | "closing_call"
  | "fb_messenger"
  | "demo_build"
  | "lead_gen"
  | "follow_up"
  | "admin"
  | "onboarding"
  | "systems"
  | "content"
  | "learning";

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

export const ACTIVITY_META: Record<Activity, { label: string; icon: IconName; color: string }> = {
  cold_calls:   { label: "Cold Calls",     icon: "phone",        color: "#f59e0b" },
  warm_calls:   { label: "Warm Calls",     icon: "fire",         color: "#dc2626" },
  closing_call: { label: "Closing Call",   icon: "check-circle", color: "#22c55e" },
  fb_messenger: { label: "FB Messenger",   icon: "chat",         color: "#8b5cf6" },
  demo_build:   { label: "Demo Build",     icon: "code",         color: "#ea580c" },
  lead_gen:     { label: "Lead-Gen Scan",  icon: "search",       color: "#3b82f6" },
  follow_up:    { label: "Follow-Ups",     icon: "envelope",     color: "#22c55e" },
  admin:        { label: "Admin / CRM",    icon: "cog",          color: "#9ca3af" },
  onboarding:   { label: "Onboarding",     icon: "rocket",       color: "#059669" },
  systems:      { label: "Systems / SOPs", icon: "wrench",       color: "#f97316" },
  content:      { label: "Content Batch",  icon: "brush",        color: "#ec4899" },
  learning:     { label: "Research",       icon: "book",         color: "#0ea5e9" },
};

// Headline targets used by the progress strip.
// Sum of all `target.count` for a given activity should equal these.
export const WEEKLY_TARGETS: Partial<Record<Activity, number>> = {
  // SOP funnel: Warm lunch call books a 6pm closing call → close from the call.
  // FB Messenger is a top-up engagement layer (5-8 evening DMs). Cold calls
  // only on Saturday morning trade window. Weekend afternoons = building the
  // business (onboarding, systems, research) not chasing volume.
  cold_calls:   20,  // Sat AM trade push only
  warm_calls:   12,  // 2/day Mon-Fri lunch + 2 Saturday lunch
  closing_call: 5,   // 1 booked closing call/day Mon-Fri (best case)
  fb_messenger: 125, // 20-30/night Mon-Fri (target 25)
  demo_build:   40,  // 5-10 post-dinner sends Mon-Fri (target 7) + 6 Sat batch
  lead_gen:     1,   // one weekly scan, Monday
  onboarding:   2,   // 2 dedicated kickoff windows/week
};

// Sustainable rhythm tuned to Jay's actual hours:
// Wake 8-8:30am · Day job 9:00-17:30 · Dog walk 12:30-13:30 (mobile-only)
// Dinner ~20:00 · Bed midnight-1am.
//
// SOP funnel: Warm lunch call books a 6-6.30pm closing call → close on that call.
// FB Messenger blast is now small (5-8/night) — quality over volume. Post-dinner
// is reserved for demo sends to today's responses. Weekends = build-the-business
// (onboarding, systems, research) not chase-volume mode.
//
// Slot IDs are stable so completion DB rows survive edits to copy/time.
export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  // ═════════════ MONDAY ═════════════
  { id: "mon-lunch-warm",    day: "mon", start: "12:30", end: "13:30", activity: "warm_calls",   title: "Warm follow-up calls — BOOK A 6PM CLOSE", target: { count: 2 },  mobile: true, rationale: "Trade lunch window. Ring 2-3 leads who reacted to Messenger demos this week. Goal isn't to close on this call — it's to BOOK a 6-6.30pm closing call tonight or this week. Phone in hand while walking the dog." },
  { id: "mon-eve-calls",     day: "mon", start: "18:00", end: "18:30", activity: "closing_call", title: "Booked closing call",      target: { count: 1 },  rationale: "The close. Booked at lunch — they know it's coming, you know what they need. 30 min max — present the demo on screen, agree T1 or T2, take the deposit / set the start date." },
  { id: "mon-eve-fb",        day: "mon", start: "18:30", end: "19:30", activity: "fb_messenger", title: "FB Messenger blast",         target: { count: 25 }, rationale: "20-30 personalised DMs to fresh leads. Each opens with a specific hook (their reviews / a problem on their FB page / a competitor reference). Responses become tonight's demo-send list." },
  { id: "mon-late-demos",    day: "mon", start: "21:00", end: "22:30", activity: "demo_build",   title: "Post-dinner demo sends",     target: { count: 7 },  rationale: "5-10 demos built and sent to today's positive responses. This is the volume that creates tomorrow's warm-call book rate — every demo sent = ~25% chance of a Tuesday lunch warm call." },

  // ═════════════ TUESDAY ═════════════
  { id: "tue-lunch-warm",    day: "tue", start: "12:30", end: "13:30", activity: "warm_calls",   title: "Warm follow-up calls — BOOK A 6PM CLOSE", target: { count: 2 },  mobile: true, rationale: "Ring 2-3 leads who reacted to last night's demo sends. Goal: book the close for 6-6.30pm tonight." },
  { id: "tue-eve-close",     day: "tue", start: "18:00", end: "18:30", activity: "closing_call", title: "Booked closing call",      target: { count: 1 },  rationale: "30-min close. Demo on screen, agree the tier, take the deposit." },
  { id: "tue-eve-fb",        day: "tue", start: "18:30", end: "19:30", activity: "fb_messenger", title: "FB Messenger blast",         target: { count: 25 }, rationale: "20-30 personalised DMs. By Tuesday you've got a feel for the patterns — double down on the trade types that replied yesterday." },
  { id: "tue-late-demos",    day: "tue", start: "21:00", end: "22:30", activity: "demo_build",   title: "Post-dinner demo sends",     target: { count: 7 },  rationale: "5-10 demos to today's responses. Each demo sent loads Wednesday's lunch warm-call queue." },

  // ═════════════ WEDNESDAY ═════════════
  { id: "wed-lunch-warm",    day: "wed", start: "12:30", end: "13:30", activity: "warm_calls",   title: "Warm follow-up calls — BOOK A 6PM CLOSE", target: { count: 2 },  mobile: true, rationale: "Mid-week is your highest-conversion lunch window. Anyone who's been DM'd Mon-Tue and not yet replied — try the call. Curiosity often opens the door." },
  { id: "wed-eve-close",     day: "wed", start: "18:00", end: "18:30", activity: "closing_call", title: "Booked closing call",      target: { count: 1 },  rationale: "30-min close on a warm lead booked at lunch." },
  { id: "wed-eve-fb",        day: "wed", start: "18:30", end: "19:30", activity: "fb_messenger", title: "FB Messenger blast",         target: { count: 25 }, rationale: "20-30 fresh DMs. Wed evening = peak engagement window per the Pricing > Best Times intel. Worth crafting these well." },
  { id: "wed-late-demos",    day: "wed", start: "21:00", end: "22:30", activity: "demo_build",   title: "Post-dinner demo sends",     target: { count: 7 },  rationale: "5-10 demos to today's responses. Wed is peak engagement — expect the busiest demo-send night of the week." },

  // ═════════════ THURSDAY ═════════════
  { id: "thu-lunch-warm",    day: "thu", start: "12:30", end: "13:30", activity: "warm_calls",   title: "Warm follow-up calls — BOOK A 6PM CLOSE", target: { count: 2 },  mobile: true, rationale: "Pre-weekend warm calls. Last chance to book a 6pm close before Saturday's onboarding focus." },
  { id: "thu-eve-close",     day: "thu", start: "18:00", end: "18:30", activity: "closing_call", title: "Booked closing call",      target: { count: 1 },  rationale: "30-min close. If you can land this one, weekend onboarding starts strong." },
  { id: "thu-eve-fb",        day: "thu", start: "18:30", end: "19:30", activity: "fb_messenger", title: "FB Messenger blast",         target: { count: 25 }, rationale: "20-30 DMs targeting weekend-active trades (Beauty/Groomers/Hair). They'll see it Friday or Saturday morning." },
  { id: "thu-late-demos",    day: "thu", start: "21:00", end: "22:30", activity: "demo_build",   title: "Post-dinner demo sends",     target: { count: 7 },  rationale: "5-10 demos to today's replies. Anyone replying late tonight gets a Friday lunch warm call." },

  // ═════════════ FRIDAY ═════════════
  { id: "fri-lunch-warm",    day: "fri", start: "12:30", end: "13:30", activity: "warm_calls",   title: "Warm follow-up calls — BOOK A 6PM CLOSE", target: { count: 2 },  mobile: true, rationale: "Last weekday warm-call window. Hit anyone who went quiet — Friday lunch they're often more relaxed than mid-week." },
  { id: "fri-eve-close",     day: "fri", start: "18:00", end: "18:30", activity: "closing_call", title: "Booked closing call",      target: { count: 1 },  rationale: "Final close-call window of the week. If you land this you go into the weekend with momentum." },
  { id: "fri-eve-fb",        day: "fri", start: "18:30", end: "19:30", activity: "fb_messenger", title: "FB Messenger blast",         target: { count: 25 }, rationale: "20-30 DMs targeting weekend-working trades (Beauty/Groomers/Hairdressers/Photographers). They'll see it Saturday morning before their first appointment." },
  { id: "fri-late-review",   day: "fri", start: "21:00", end: "22:30", activity: "demo_build",   title: "Post-dinner demo sends",     target: { count: 7 },  rationale: "5-10 demos to today's responses. Last weekday send-off — anyone replying tonight or Saturday morning gets a Sat AM call session attempt." },
  { id: "fri-late-rest",     day: "fri", start: "22:30", end: "23:00", activity: "admin",        title: "STOP — protect Friday night", protectedRest: true,  rationale: "Hard stop. Friday night is decompress. Weekly review happens Saturday morning instead." },

  // ═════════════ SATURDAY (call session AM, build-the-business PM) ═════════════
  { id: "sat-early-review",  day: "sat", start: "08:30", end: "09:00", activity: "admin",        title: "Weekly review + Sat plan",                          rationale: "Quick 30-min review of the week: KPIs vs targets, who closed, who ghosted, what to push next week. Plan the call session." },
  { id: "sat-am-calls",      day: "sat", start: "09:00", end: "12:00", activity: "cold_calls",   title: "Trade call session (cold + warm)", target: { count: 20 }, rationale: "3-hour outbound block. Mix of cold trade calls (roofers / driveway / construction at yards / merchants Saturday AM) AND warm follow-ups for anyone you couldn't reach by phone all week. Bring coffee, settle in." },
  { id: "sat-lunch-warm",    day: "sat", start: "12:00", end: "13:00", activity: "warm_calls",   title: "Lunch warm follow-ups",      target: { count: 2 },  mobile: true, rationale: "Quick lunch + dog walk. Couple of warm calls to leads from the morning session who didn't answer." },
  { id: "sat-pm-onboard",    day: "sat", start: "13:00", end: "16:00", activity: "onboarding",   title: "Onboarding work — new clients", target: { count: 1 },  rationale: "Kickoff calls, brand-asset collection, domain registration, content collection. Whatever any newly-signed clients need to get to LIVE." },
  { id: "sat-pm-systems",    day: "sat", start: "16:00", end: "17:30", activity: "systems",      title: "Systems / SOP fine-tuning",                          rationale: "Refine the SOPs that are running the business — outreach templates, demo-build skill prompts, onboarding checklist, CRM automations. The 'work on the business, not in it' hour." },
  { id: "sat-eve-rest",      day: "sat", start: "17:30", end: "23:00", activity: "admin",        title: "STOP — family time",         protectedRest: true,    rationale: "Hard stop. Saturday evening protected. Non-negotiable." },

  // ═════════════ SUNDAY (research + onboarding) ═════════════
  { id: "sun-am-research",   day: "sun", start: "11:00", end: "13:00", activity: "learning",     title: "Business model + sales research",                   rationale: "Read, watch, study. Sales books, competitor websites, agency case studies, sharper pitches. Long-term moat: smarter offer beats louder volume." },
  { id: "sun-pm-onboard",    day: "sun", start: "13:00", end: "15:00", activity: "onboarding",   title: "Onboarding work + client kickoffs", target: { count: 1 },  rationale: "Sunday lunchtime — clients relaxed at home, perfect for kickoff calls. Continue any onboarding tasks not finished Saturday." },
  { id: "sun-pm-systems",    day: "sun", start: "15:00", end: "17:00", activity: "systems",      title: "Systems + content batch",                            rationale: "Half on systems (CRM tweaks, skill prompts, templates), half on a light content batch (1-2 Reels, 3-4 social posts for the week)." },
  { id: "sun-eve-rest",      day: "sun", start: "17:00", end: "23:00", activity: "admin",        title: "STOP — protect Sun evening", protectedRest: true,   rationale: "Hard stop. Sleep, mental reset for Monday's grind." },
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
