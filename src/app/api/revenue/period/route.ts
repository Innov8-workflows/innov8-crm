import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { buildRevenuePeriod, isValidDate, presetRange, type DayRange } from "@/lib/revenuePeriods";

// Agency revenue for a date range: the snapshot at the end of it, the opening
// snapshot, what moved during it, and a month-by-month series.
//
// GET /api/revenue/period?start=YYYY-MM-DD&end=YYYY-MM-DD&owner=
//   `end` is EXCLUSIVE — half-open [start, end), matching every other range in this
//   codebase (see src/lib/clientReporting.ts:15-26).
//
// Deliberately NOT part of /api/bootstrap: that single-flights on owner alone and
// sits on every app load's critical path, so a period-dependent payload would either
// destroy its "one request, everyone awaits it" property or freeze the period at
// page-load time. The Dashboard isn't a bootstrap consumer anyway.

// Generous: the "All time" preset legitimately asks from 1970, and buildRevenuePeriod
// clamps the start up to the first month that actually contains data. This is only a
// backstop against absurd input, not the real bound on series length — monthsBetween
// caps that.
const MAX_SPAN_DAYS = 366 * 60;

export async function GET(request: NextRequest) {
  await initDb();
  const params = request.nextUrl.searchParams;

  const fallback = presetRange("last_12m");
  const start = params.get("start") || fallback.start;
  const end = params.get("end") || fallback.end;

  if (!isValidDate(start) || !isValidDate(end)) {
    return NextResponse.json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "end must be after start (end is exclusive)" }, { status: 400 });
  }
  // Guard the series builder: without this a corrupt stored range could ask for
  // thousands of month buckets.
  const spanDays = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (spanDays > MAX_SPAN_DAYS) {
    return NextResponse.json({ error: "range too long (max 5 years)" }, { status: 400 });
  }

  const owner = params.get("owner") || null;
  const range: DayRange = { start, end };

  const data = await buildRevenuePeriod(getClient(), owner, range);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
