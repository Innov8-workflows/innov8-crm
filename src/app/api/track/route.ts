import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import crypto from "crypto";

// Public, CORS-open endpoint that ingests site events from the tracker JS.
// No auth — relies on tracking_id being effectively-secret per project.

const ALLOWED_EVENTS = new Set([
  "page_view",
  "call_click",
  "whatsapp_click",
  "email_click",
  "messenger_click",
  "map_click",
  "social_click",
  "booking_click",
  "form_submit",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Hash IPs with a daily salt — gives us "unique visitor" approximation
// without storing actual IPs (GDPR-friendly).
function hashIp(ip: string): string {
  const today = new Date().toISOString().split("T")[0];
  return crypto.createHash("sha256").update(`${ip}:${today}:innov8`).digest("hex").slice(0, 16);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  try {
    await initDb();
    const body = await request.json();
    const { tracking_id, event_type, path, referrer, metadata } = body || {};

    if (!tracking_id || !event_type) {
      return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
    }
    if (!ALLOWED_EVENTS.has(event_type)) {
      return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
    }

    const db = getClient();
    const project = first(await db.execute({
      sql: "SELECT id FROM projects WHERE tracking_id = ?",
      args: [tracking_id],
    }));
    if (!project) {
      // Silently accept-but-discard — don't leak project existence
      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
    const ua = request.headers.get("user-agent") || "";

    await db.execute({
      sql: `INSERT INTO site_events (project_id, event_type, path, referrer, user_agent, ip_hash, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        project.id as number,
        event_type,
        (path || "").slice(0, 200),
        (referrer || "").slice(0, 200),
        ua.slice(0, 200),
        hashIp(ip),
        metadata ? JSON.stringify(metadata).slice(0, 500) : "",
      ],
    });

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS });
  }
}
