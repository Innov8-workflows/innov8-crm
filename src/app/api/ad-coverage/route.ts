import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, all, first } from "@/lib/db";
import {
  listAdClients, resolvePlace, DEFAULT_RADIUS_MILES, MAX_RADIUS_MILES,
} from "@/lib/adCoverage";
import { sleep, TransientGeocodeError } from "@/lib/geocode";

// Ad coverage for the Coverage Map and the client window. Session-guarded by
// the middleware. Towns are geocoded once, here, when they are added.

export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_PLACES = 40;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** GET — every ad client with coverage; ?project_id= for one client's editor. */
export async function GET(request: NextRequest) {
  await initDb();
  const db = getClient();
  const clients = await listAdClients(db);
  const pid = Number(request.nextUrl.searchParams.get("project_id") || 0);

  if (pid) {
    const areas = all(await db.execute({
      sql: "SELECT id, place, place_label, lat, lng, radius_miles FROM ad_coverage WHERE project_id = ? ORDER BY id",
      args: [pid],
    }));
    const c = clients.find((x) => x.project_id === pid);
    return NextResponse.json({
      project_id: pid, is_ad_client: !!c, platforms: c?.platforms || [], trade: c?.trade || "",
      areas,
    }, { headers: NO_STORE });
  }

  const trades = [...new Set(clients.map((c) => c.trade).filter(Boolean))].sort();
  return NextResponse.json({
    clients,
    not_set: clients.filter((c) => !c.areas.length).map((c) => c.project_id),
    trades,
  }, { headers: NO_STORE });
}

/** POST { project_id, places: string[], radius_miles } — geocode and save towns (existing ones get the new radius). */
export async function POST(request: NextRequest) {
  let b: { project_id?: number; places?: string[]; radius_miles?: number };
  try { b = await request.json(); } catch { return bad("bad body"); }
  const pid = Number(b.project_id || 0);
  if (!pid) return bad("project_id required");
  const radius = Number(b.radius_miles ?? DEFAULT_RADIUS_MILES);
  if (!(radius > 0 && radius <= MAX_RADIUS_MILES)) return bad(`radius must be between 1 and ${MAX_RADIUS_MILES} miles`);
  const places = [...new Set((b.places || []).map((p) => String(p).trim().replace(/\s+/g, " ")).filter(Boolean))];
  if (!places.length) return bad("no towns given");
  if (places.length > MAX_PLACES) return bad(`at most ${MAX_PLACES} towns at a time`);
  if (places.some((p) => p.length > 80)) return bad("a town name is over 80 characters");

  await initDb();
  const db = getClient();
  if (!first(await db.execute({ sql: "SELECT id FROM projects WHERE id = ?", args: [pid] }))) return bad("no such project", 404);

  const existing = new Map(all(await db.execute({
    sql: "SELECT place FROM ad_coverage WHERE project_id = ?", args: [pid],
  })).map((r) => [String(r.place).toLowerCase(), String(r.place)]));

  const saved: string[] = [], notFound: string[] = [], failed: string[] = [];
  const started = Date.now();
  let lookedUp = false;
  for (const place of places) {
    // Already there: just take the new radius, no lookup needed.
    const known = existing.get(place.toLowerCase());
    if (known) {
      await db.execute({
        sql: "UPDATE ad_coverage SET radius_miles = ?, updated_at = ? WHERE project_id = ? AND place = ?",
        args: [radius, now(), pid, known],
      });
      saved.push(known);
      continue;
    }
    if (Date.now() - started > 50_000) { failed.push(place); continue; }
    if (lookedUp) await sleep(1050);   // Nominatim allows one request a second
    lookedUp = true;
    try {
      const r = await resolvePlace(place);
      if (!r) { notFound.push(place); continue; }
      await db.execute({
        sql: `INSERT INTO ad_coverage (project_id, place, place_label, lat, lng, radius_miles, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(project_id, place) DO UPDATE SET radius_miles = excluded.radius_miles, updated_at = excluded.updated_at`,
        args: [pid, place, r.label, r.lat, r.lng, radius, now(), now()],
      });
      saved.push(place);
    } catch (e) {
      if (e instanceof TransientGeocodeError) failed.push(place); else throw e;
    }
  }
  return NextResponse.json({ ok: true, saved, not_found: notFound, failed }, { headers: NO_STORE });
}

/** PUT { project_id, radius_miles } — one radius for all of a client's towns. */
export async function PUT(request: NextRequest) {
  let b: { project_id?: number; radius_miles?: number };
  try { b = await request.json(); } catch { return bad("bad body"); }
  const pid = Number(b.project_id || 0);
  const radius = Number(b.radius_miles);
  if (!pid) return bad("project_id required");
  if (!(radius > 0 && radius <= MAX_RADIUS_MILES)) return bad(`radius must be between 1 and ${MAX_RADIUS_MILES} miles`);
  await initDb();
  const res = await getClient().execute({
    sql: "UPDATE ad_coverage SET radius_miles = ?, updated_at = ? WHERE project_id = ?",
    args: [radius, now(), pid],
  });
  return NextResponse.json({ ok: true, updated: res.rowsAffected }, { headers: NO_STORE });
}

/** DELETE { id } — remove one town. */
export async function DELETE(request: NextRequest) {
  let b: { id?: number };
  try { b = await request.json(); } catch { return bad("bad body"); }
  const id = Number(b.id || 0);
  if (!id) return bad("id required");
  await initDb();
  const res = await getClient().execute({ sql: "DELETE FROM ad_coverage WHERE id = ?", args: [id] });
  if (!res.rowsAffected) return bad("no such town", 404);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
