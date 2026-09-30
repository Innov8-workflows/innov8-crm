import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import { lines, str } from "@/lib/onboardingExport";
import { parseRadiusMiles, DEFAULT_RADIUS_MILES } from "@/lib/adCoverage";

// POST /api/ad-coverage/import { project_id }
// Proposes a client's ad towns and radius from their Meta ad onboarding form.
// DOES NOT SAVE: the client window shows the list and Jay confirms, which then
// goes through POST /api/ad-coverage like any other add.
export async function POST(request: NextRequest) {
  let b: { project_id?: number };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const pid = Number(b.project_id || 0);
  if (!pid) return NextResponse.json({ error: "project_id required" }, { status: 400 });

  await initDb();
  // The newest submitted ad form for this client. LEFT JOIN not needed: we ask by project.
  const row = first(await getClient().execute({
    sql: `SELECT s.id, s.submitted_at, a.answers_json
            FROM onboarding_submissions s
            JOIN onboarding_answers a ON a.submission_id = s.id
           WHERE s.project_id = ? AND s.kind = 'meta_ads' AND s.status IN ('submitted', 'accepted', 'built')
           ORDER BY s.submitted_at DESC, s.id DESC LIMIT 1`,
    args: [pid],
  }));
  if (!row) {
    return NextResponse.json({ error: "No ad onboarding form has been submitted for this client — add the towns by hand." }, { status: 404 });
  }

  let answers: Record<string, unknown> = {};
  try { answers = JSON.parse(String(row.answers_json || "{}")); } catch { /* treated as empty */ }
  const radiusText = str(answers, "radius");
  return NextResponse.json({
    submission_id: Number(row.id),
    towns: lines(answers, "target_towns").slice(0, 40),
    excluded: lines(answers, "exclude_areas"),
    radius_text: radiusText,
    radius_miles: parseRadiusMiles(radiusText) ?? DEFAULT_RADIUS_MILES,
    radius_guessed: parseRadiusMiles(radiusText) === null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
