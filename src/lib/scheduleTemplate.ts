// Jay's burn-the-boats weekly schedule — built around 9-5.30 Mon-Fri day job
// + 1hr dog-walk lunch (12:30-13:30, mobile-only). ~30 hr/week side-hustle push.
//
// Slots are hardcoded — edit this file to tweak the structure. Completion state
// is stored in DB per (slot_id, date).

export type Activity =
  | "cold_calls"
  | "fb_messenger"
  | "demo_build"
  | "lead_gen"
  | "follow_up"
  | "admin"
  | "onboarding"
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

export const ACTIVITY_META: Record<Activity, { label: string; emoji: string; color: string }> = {
  cold_calls:   { label: "Cold Calls",     emoji: "📞", color: "#f59e0b" },
  fb_messenger: { label: "FB Messenger",   emoji: "💬", color: "#8b5cf6" },
  demo_build:   { label: "Demo Build",     emoji: "🏗",  color: "#ea580c" },
  lead_gen:     { label: "Lead-Gen Scan",  emoji: "🔍", color: "#3b82f6" },
  follow_up:    { label: "Follow-Ups",     emoji: "📧", color: "#22c55e" },
  admin:        { label: "Admin / CRM",    emoji: "⚙️",  color: "#9ca3af" },
  onboarding:   { label: "Onboarding",     emoji: "🎯", color: "#059669" },
  content:      { label: "Content Batch",  emoji: "🎨", color: "#ec4899" },
  learning:     { label: "Strategy",       emoji: "📚", color: "#0ea5e9" },
};

// Headline targets used by the progress strip.
// Sum of all `target.count` for a given activity should equal these.
export const WEEKLY_TARGETS: Partial<Record<Activity, number>> = {
  cold_calls:   90,
  fb_messenger: 50,
  demo_build:   15,
  lead_gen:     2,
  onboarding:   2,
};

// The full 30-hr week — slot IDs are stable so completion DB rows survive edits to copy/time.
export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  // ═════════════ MONDAY ═════════════
  { id: "mon-am-leadgen",    day: "mon", start: "06:30", end: "07:30", activity: "lead_gen",     title: "Lead-Gen Scan — fresh batch", target: { count: 1 }, rationale: "Start the week with 25-30 qualified prospects queued. Use /prospect-leadgen-warm for FB recommendation mining." },
  { id: "mon-lunch-fb",      day: "mon", start: "12:30", end: "13:30", activity: "fb_messenger", title: "Dog-walk FB blast",          target: { count: 5 },  mobile: true, rationale: "5 quick personalised DMs from the phone while walking. No deep work — just send + bookmark." },
  { id: "mon-eve-calls",     day: "mon", start: "18:00", end: "19:30", activity: "cold_calls",   title: "Cold Calls — T1 leads",      target: { count: 15 }, rationale: "Trades just got home, relaxed. Hit leads who said 'send it over' last week — easiest reopens of the week." },
  { id: "mon-eve-demos",     day: "mon", start: "19:30", end: "21:00", activity: "demo_build",   title: "Build 2 demos",              target: { count: 2 },  rationale: "Bank 2 demos for outbound this week. 90 min × ~30 min/site = doable in batch." },
  { id: "mon-late-followup", day: "mon", start: "21:00", end: "22:00", activity: "follow_up",    title: "Clear today's follow-ups",                          rationale: "Last hour: hammer the overdue queue, nothing rolls into Tuesday." },

  // ═════════════ TUESDAY ═════════════
  { id: "tue-am-fb",         day: "tue", start: "06:30", end: "07:30", activity: "fb_messenger", title: "FB Messenger blast",         target: { count: 20 }, rationale: "Biggest FB-send window. 20 personalised DMs to leads from yesterday's lead-gen scan." },
  { id: "tue-lunch-fb",      day: "tue", start: "12:30", end: "13:30", activity: "fb_messenger", title: "Dog-walk replies",           target: { count: 5 },  mobile: true, rationale: "Reply to overnight FB responses on the walk. Keep momentum hot." },
  { id: "tue-eve-calls",     day: "tue", start: "18:00", end: "19:30", activity: "cold_calls",   title: "Cold Calls — T2 leads",      target: { count: 15 }, rationale: "Tuesday is when the week's settled in. Push T2 (£299/£50) — mid-tier sweet spot." },
  { id: "tue-eve-demos",     day: "tue", start: "19:30", end: "21:00", activity: "demo_build",   title: "Build 2 demos",              target: { count: 2 },  rationale: "Replenish demo pipeline for Wed/Thu hot calls." },
  { id: "tue-late-email",    day: "tue", start: "21:00", end: "22:00", activity: "follow_up",    title: "Email follow-up sequence",                          rationale: "Long-form email follow-ups for cold-call no-answers. Different channel, different opener." },

  // ═════════════ WEDNESDAY (peak day) ═════════════
  { id: "wed-am-demo",       day: "wed", start: "06:30", end: "07:30", activity: "demo_build",   title: "1 demo before work",         target: { count: 1 },  rationale: "Wednesday peaks — start the day with a finished demo ready to send mid-call." },
  { id: "wed-lunch-fb",      day: "wed", start: "12:30", end: "13:30", activity: "fb_messenger", title: "Dog-walk FB sends",          target: { count: 5 },  mobile: true, rationale: "5 sends on mobile during walk." },
  { id: "wed-eve-calls",     day: "wed", start: "18:00", end: "19:30", activity: "cold_calls",   title: "PUSH NIGHT — Cold Calls",    target: { count: 20 }, rationale: "Per the Pricing > Best Times intel: Wed evening = peak conversion. Higher quota, bigger push." },
  { id: "wed-eve-onboard",   day: "wed", start: "19:30", end: "21:00", activity: "onboarding",   title: "Onboarding call window",     target: { count: 1 },  rationale: "Pre-book new-client onboarding calls into this slot. Evening = client comfortable on their sofa." },
  { id: "wed-late-admin",    day: "wed", start: "21:00", end: "22:00", activity: "admin",        title: "CRM admin + status updates",                        rationale: "Mid-week CRM hygiene — update stages from the day, fix any drag-and-drop drift." },

  // ═════════════ THURSDAY (peak day) ═════════════
  { id: "thu-am-leadgen",    day: "thu", start: "06:30", end: "07:30", activity: "lead_gen",     title: "Mid-week lead-gen refill",   target: { count: 1 },  rationale: "Top up the prospect pool — keep next week loaded. Aim for 25-30 fresh." },
  { id: "thu-lunch-fb",      day: "thu", start: "12:30", end: "13:30", activity: "fb_messenger", title: "Dog-walk FB sends",          target: { count: 5 },  mobile: true, rationale: "5 sends on mobile." },
  { id: "thu-eve-calls",     day: "thu", start: "18:00", end: "19:30", activity: "cold_calls",   title: "Cold Calls — push night #2", target: { count: 20 }, rationale: "Thursday equals Wednesday for conversion. Trades thinking about wrapping the week — receptive." },
  { id: "thu-eve-fbseq",     day: "thu", start: "19:30", end: "21:00", activity: "fb_messenger", title: "FB follow-up sequence",                              rationale: "Sweep the week's no-reply DMs with a softer second touch. Many trades reply on the second nudge." },
  { id: "thu-late-demo",     day: "thu", start: "21:00", end: "22:00", activity: "demo_build",   title: "1 demo",                     target: { count: 1 },  rationale: "Build for Friday-morning sends + Sat batch warmup." },

  // ═════════════ FRIDAY (wind down) ═════════════
  { id: "fri-am-review",     day: "fri", start: "06:30", end: "07:30", activity: "admin",        title: "Weekly review + next-week plan",                    rationale: "Honest hour: KPIs vs targets, who's been pitched, what to push next week. Plan Saturday's batch." },
  { id: "fri-lunch-fb",      day: "fri", start: "12:30", end: "13:30", activity: "fb_messenger", title: "Dog-walk FB sends",          target: { count: 5 },  mobile: true, rationale: "Last 5 weekday sends. Quality over quantity — pick the hottest leads only." },
  { id: "fri-eve-calls",     day: "fri", start: "18:00", end: "19:00", activity: "cold_calls",   title: "Cold Calls — Fri-AM types",  target: { count: 10 }, rationale: "Fri evenings trades bolt early — keep quota lower and target lifestyle businesses (Beauty/Groomers) who work Saturdays." },
  { id: "fri-eve-demos",     day: "fri", start: "19:00", end: "21:00", activity: "demo_build",   title: "Clear demo backlog",                                rationale: "Burn through any deferred demos so Saturday's batch is fresh leads only, not catch-up." },
  { id: "fri-late-rest",     day: "fri", start: "21:00", end: "22:00", activity: "admin",        title: "STOP — protect Friday night", protectedRest: true,  rationale: "Hard stop. Friday night is family/decompress. Going past this burns out within a month." },

  // ═════════════ SATURDAY (deep work) ═════════════
  { id: "sat-am-coffee",     day: "sat", start: "08:00", end: "09:00", activity: "admin",        title: "Coffee + CRM warmup",                                rationale: "Slow start. Review yesterday's wins, check overnight FB replies, queue the demo batch." },
  { id: "sat-am-demos",      day: "sat", start: "09:00", end: "12:00", activity: "demo_build",   title: "6-DEMO BATCH — deep work", target: { count: 6 },     rationale: "Best 3 hours of the week. No interruptions = fastest output. Build 6 demos in a row, queue for Mon outreach." },
  { id: "sat-noon-calls",    day: "sat", start: "12:00", end: "13:30", activity: "cold_calls",   title: "Saturday trades calls",      target: { count: 10 }, rationale: "Beauticians/groomers/hairdressers work Saturday mornings — catch them on lunch break. Different niche from weekday trades." },
  { id: "sat-pm-content",    day: "sat", start: "14:00", end: "17:00", activity: "content",      title: "Content batch — Reels + posts",                     rationale: "Batch 7 days of content for own socials + 1-2 client sites. Reels, before/afters, testimonial posts." },
  { id: "sat-pm-rest",       day: "sat", start: "18:00", end: "22:00", activity: "admin",        title: "STOP — family time",         protectedRest: true,    rationale: "Hard stop. Saturday evening protected. Non-negotiable." },

  // ═════════════ SUNDAY (lighter, strategic) ═════════════
  { id: "sun-am-strategy",   day: "sun", start: "10:00", end: "12:00", activity: "learning",     title: "Strategy + learning + community",                   rationale: "Read, watch, engage in trade groups. Long-term moat: better at pitching, sharper offers, deeper niche knowledge." },
  { id: "sun-noon-onboard",  day: "sun", start: "12:00", end: "14:00", activity: "onboarding",   title: "Onboarding call window",     target: { count: 1 },   rationale: "Sunday lunchtime — clients relaxed at home, perfect for kickoff calls. Second slot to Wed-eve." },
  { id: "sun-pm-overflow",   day: "sun", start: "14:00", end: "17:00", activity: "demo_build",   title: "Demo overflow + admin",                             rationale: "Catch-up window for anything that slipped during the week. If nothing slipped, build 2 ahead-of-schedule demos." },
  { id: "sun-pm-rest",       day: "sun", start: "17:00", end: "22:00", activity: "admin",        title: "STOP — protect Sun evening", protectedRest: true,   rationale: "Hard stop. Sleep, mental reset for Monday's grind." },
];

// ─── Helpers ───────────────────────────────────────────────────────────

/** Returns Monday's YYYY-MM-DD for the week containing the given date. */
export function mondayOfWeek(d: Date = new Date()): string {
  const day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

/** Date string (YYYY-MM-DD) for nth day after a given Monday string. */
export function dateForDayOffset(monday: string, dayOffset: number): string {
  const d = new Date(monday + "T00:00:00");
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0];
}

/** Day-of-week index (0=Mon, 6=Sun) for a Day enum. */
export const DAY_INDEX: Record<Day, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/** "Today" as a Day enum, or null on Sunday→Monday boundary edge. */
export function todayAsDay(): Day | null {
  const idx = new Date().getDay(); // 0=Sun..6=Sat
  const mapping: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return mapping[idx] || null;
}
