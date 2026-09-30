import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb } from "@/lib/db";
import { listAdClients, checkArea, resolvePlace, DEFAULT_RADIUS_MILES, MAX_RADIUS_MILES } from "@/lib/adCoverage";
import { TransientGeocodeError } from "@/lib/geocode";

// GET /api/ad-coverage/check?place=&trade=&radius=
// "Can I run ads for this prospect?" — is a same-trade ad client already
// covering this area? Session-guarded by the middleware.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const place = (sp.get("place") || "").trim();
  const trade = (sp.get("trade") || "").trim();
  const radius = Number(sp.get("radius") || DEFAULT_RADIUS_MILES);
  if (!place) return NextResponse.json({ error: "place required" }, { status: 400 });
  if (!(radius > 0 && radius <= MAX_RADIUS_MILES)) {
    return NextResponse.json({ error: `radius must be between 1 and ${MAX_RADIUS_MILES} miles` }, { status: 400 });
  }

  let centre;
  try { centre = await resolvePlace(place); }
  catch (e) {
    if (e instanceof TransientGeocodeError) return NextResponse.json({ error: "The map lookup service didn't answer — try again in a moment" }, { status: 503 });
    throw e;
  }
  if (!centre) return NextResponse.json({ error: `Couldn't find "${place}" — try a nearby town or a postcode` }, { status: 404 });

  await initDb();
  const clients = await listAdClients(getClient());
  const result = checkArea(clients, centre, trade, radius);
  return NextResponse.json({
    place, matched: centre.label, lat: centre.lat, lng: centre.lng, radius_miles: radius, ...result,
    clients_without_coverage: clients.filter((c) => !c.areas.length && (!result.trade || !c.trade || c.trade === result.trade))
      .map((c) => ({ project_id: c.project_id, business_name: c.business_name })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
