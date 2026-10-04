import { NextRequest, NextResponse } from "next/server";
import { getClient, initDb, first } from "@/lib/db";
import type { InStatement } from "@libsql/client";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { sendEmailWithRetry, isEmailConfigured } from "@/lib/email";

// Enquiries from Jay's OWN website (innov8workflows.co.uk), posted straight from
// the visitor's browser just before the form opens WhatsApp. Before this, the
// form only pre-filled a WhatsApp message, so an enquiry the visitor never
// actually sent was lost, and nothing recorded where they came from.
//
// Auth, browser path: none can exist — the caller is a public web page, so any
// secret would sit in its source. Instead: an Origin allowlist (stops other
// sites' browsers), a honeypot field, a per-IP rate limit and length clamps.
// curl can still post, which is the same exposure as any contact form; the
// worst case is a junk prospect, never a read.
//
// Auth, server path: the GHL "Innov8 Workflows" sub-account's workflow posts
// website-chat contacts here with the lead_ingest_key of Jay's OWN project
// (x-innov8-key header or ?key=), so a client's Apps Script key can never
// write into Jay's prospect pipeline. GHL's webhook body (first_name,
// contact_id, customData...) is mapped onto the same fields.
//
// Unlike /api/webhook/prospects this NEVER skips a known business. A prospect
// Jay has already scraped or messaged who then fills in the form is the hottest
// lead in the CRM, so an existing match gets a note, a timeline entry and
// today's follow-up date instead of being dropped as a duplicate.

const ORIGINS = ["https://innov8workflows.co.uk", "https://www.innov8workflows.co.uk"];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const OWN_TRACKING_ID = "proj_f5d3ac1edd12"; // the innov8workflows.co.uk project
const NOTIFY_TO =process.env.ENQUIRY_NOTIFY_TO || process.env.RESEND_REPLY_TO || "jamie@innov8workflows.co.uk";

const clamp = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function cors(origin: string): Record<string, string> {
  const ok = ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin);
  return ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" } : {};
}

// How the visitor reached the site, from ad click IDs, UTM tags and the
// referrer. Same rules as the ghl-lead Worker that tags client-site leads.
const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|ask)\./;
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsocial|paid_social|paid-social|display|ads?)$/i;

function attribute(pageUrl: string, referrer: string) {
  let url: URL | null = null, ref: URL | null = null;
  try { url = new URL(pageUrl); } catch {}
  try { ref = referrer ? new URL(referrer) : null; } catch {}
  const p = url ? url.searchParams : new URLSearchParams();
  const src = (p.get("utm_source") || "").toLowerCase();
  const medium = p.get("utm_medium") || "";
  const campaign = p.get("utm_campaign") || "";
  const paid = PAID_MEDIUM.test(medium);
  const refHost = ref && (!url || ref.hostname !== url.hostname) ? ref.hostname.replace(/^www\./, "") : "";

  let channel: string;
  if (p.get("gclid") || p.get("gbraid") || p.get("wbraid") || (paid && /google/.test(src))) channel = "Google Ads";
  else if (p.get("msclkid") || (paid && /bing|microsoft/.test(src))) channel = "Bing Ads";
  else if (paid && /facebook|fb|instagram|meta|ig/.test(src)) channel = "Facebook Ads";
  else if (paid && /linkedin/.test(src)) channel = "LinkedIn Ads";
  else if (paid && src) channel = src + " ads";
  else if (/^(gbp|gmb|google[_-]?business|googlemybusiness|business[_-]?profile)$/.test(src)) channel = "Google Business Profile";
  else if (src) channel = src.replace(/^./, (c) => c.toUpperCase());
  else if (refHost && /linkedin|lnkd/.test(refHost)) channel = "LinkedIn";
  else if (refHost && /instagram/.test(refHost)) channel = "Instagram";
  else if (p.get("fbclid") || (refHost && /facebook|messenger/.test(refHost))) channel = "Facebook";
  else if (refHost && SEARCH.test(refHost)) channel = refHost.split(".")[0].replace(/^./, (c) => c.toUpperCase()) + " search";
  else if (refHost) channel = "Referral: " + refHost;
  else channel = "Direct";

  const utm = [src, medium, campaign].filter(Boolean).join(" / ");
  return { channel, utm };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get("origin") || "") });
}

// GHL's standard webhook body -> the form's field names. customData is what
// the workflow's webhook action adds on top (form label etc).
function fromGhl(b: Record<string, unknown>): Record<string, unknown> {
  const cd = (b.customData && typeof b.customData === "object" ? b.customData : {}) as Record<string, unknown>;
  const attr = (b.attributionSource && typeof b.attributionSource === "object" ? b.attributionSource : {}) as Record<string, unknown>;
  const loc = (b.location && typeof b.location === "object" ? b.location : {}) as Record<string, unknown>;
  const fullName = String(b.full_name || [b.first_name, b.last_name].filter(Boolean).join(" ") || "").trim();
  const link = b.contact_id && loc.id
    ? `https://app.gohighlevel.com/v2/location/${loc.id}/contacts/detail/${b.contact_id}` : "";
  return {
    firstName: b.first_name || fullName.split(" ")[0],
    lastName: b.last_name,
    email: b.email,
    phone: b.phone,
    company: b.company_name || cd.company || (fullName ? `${fullName} (website chat)` : ""),
    message: [cd.message, link && `Conversation in GHL: ${link}`].filter(Boolean).join("\n"),
    form: cd.form || "Website chat",
    page: attr.url || cd.page,
    referrer: attr.referrer,
  };
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  let headers = cors(origin);

  const key = request.headers.get("x-innov8-key") || request.nextUrl.searchParams.get("key") || "";
  let serverCall = false;
  if (key) {
    if (!key.startsWith("lk_")) return NextResponse.json({ ok: false, error: "bad key" }, { status: 401 });
    await initDb();
    const own = first(await getClient().execute({
      sql: "SELECT id FROM projects WHERE lead_ingest_key = ? AND tracking_id = ? LIMIT 1",
      args: [key, OWN_TRACKING_ID],
    }));
    if (!own) return NextResponse.json({ ok: false, error: "bad key" }, { status: 401 });
    serverCall = true;
    headers = {};
  } else {
    if (!headers["Access-Control-Allow-Origin"]) {
      return NextResponse.json({ ok: false, error: "origin not allowed" }, { status: 403 });
    }
    const limit = rateLimit(`site-enquiry:${clientIp(request)}`, 8, 60 * 60_000);
    if (!limit.ok) {
      return NextResponse.json({ ok: false, error: "too many enquiries, try again later" }, { status: 429, headers });
    }
  }

  // The page sends text/plain JSON so the browser skips the CORS preflight;
  // GHL sends application/json. Both parse the same way.
  let f: Record<string, unknown>;
  try { f = JSON.parse(await request.text()); } catch {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400, headers });
  }
  if (!f || typeof f !== "object") return NextResponse.json({ ok: false, error: "bad body" }, { status: 400, headers });
  if (serverCall && (f.contact_id || f.first_name || f.full_name)) f = fromGhl(f);

  // Honeypot: bots fill the hidden field. Pretend success, save nothing.
  if (f.company_website) return NextResponse.json({ ok: true }, { headers });

  const firstName = clamp(f.firstName, 80);
  const lastName = clamp(f.lastName, 80);
  const contactName = [firstName, lastName].filter(Boolean).join(" ");
  const email = clamp(f.email, 200);
  const phone = clamp(f.phone, 40);
  const company = clamp(f.company, 160);
  const service = clamp(f.service, 120);
  const trade = clamp(f.trade, 120);
  // Business type comes from the form's dropdown, whose values match the CRM's
  // existing business_type vocabulary (Roofer, Driveway, Builder...). The ad
  // landing page sends a free-text "trade" instead.
  const businessType = clamp(f.businessType, 80) || trade;
  // Current website: only the main enquiry forms ask, so "asked" separates a
  // deliberate blank (no website, which ticks the "No Website?" column) from a
  // form that never had the field.
  const websiteAsked = typeof f.website === "string";
  let website = clamp(f.website, 300);
  if (website && !/^https?:\/\//i.test(website)) website = "https://" + website.replace(/^\/+/, "");
  const message = clamp(f.message, 3000);
  const form = clamp(f.form, 60) || "Website form";
  const page = clamp(f.page, 500);
  const referrer = clamp(f.referrer, 500);

  if (!firstName || !company || (!email && phone.replace(/\D/g, "").length < 10)) {
    return NextResponse.json({ ok: false, error: "name, business and a way to reply are required" }, { status: 422, headers });
  }

  const { channel, utm } = attribute(page, referrer);
  const summary = [
    `Website enquiry (${form}) via ${channel}`,
    `From: ${[contactName, company, email, phone].filter(Boolean).join(", ")}`,
    service && `Service: ${service}`,
    businessType && `Business type: ${businessType}`,
    websiteAsked && `Current website: ${website || "none"}`,
    message && `Message: ${message}`,
    page && `Page: ${page}`,
    referrer && `Referrer: ${referrer}`,
    utm && `UTM: ${utm}`,
  ].filter(Boolean).join("\n");

  await initDb();
  const db = getClient();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // A business-name match is the same prospect. An email match on its own is
  // not: people enquire about a new business from an address already on file
  // (Jay's own Gmail sits on lead 18), and attaching that to the old record
  // hides a new prospect. So an email match only counts when the names agree,
  // or when a chat lead arrived without a real business name.
  const byName = first(await db.execute({
    sql: "SELECT id, business_name, status FROM leads WHERE lower(business_name) = lower(?) ORDER BY id LIMIT 1",
    args: [company],
  }));
  const byEmail = email ? first(await db.execute({
    sql: "SELECT id, business_name, status FROM leads WHERE lower(email) = lower(?) ORDER BY id LIMIT 1",
    args: [email],
  })) : null;
  const noRealName = / \(website chat\)$/.test(company);
  const existing = byName || (byEmail && noRealName ? byEmail : null);
  const sameEmail = !existing && byEmail ? byEmail : null;
  const leadNote = sameEmail
    ? `${summary}\nSame email as existing prospect #${sameEmail.id} (${String(sameEmail.business_name)})`
    : summary;

  let leadId: number;
  try {
    if (existing) {
      leadId = Number(existing.id);
      // Fill blanks only; never overwrite what Jay has already recorded.
      const stmts: InStatement[] = [
        { sql: `UPDATE leads SET
                  contact_name = CASE WHEN contact_name = '' THEN ? ELSE contact_name END,
                  email = CASE WHEN email = '' THEN ? ELSE email END,
                  phone = CASE WHEN phone = '' THEN ? ELSE phone END,
                  business_type = CASE WHEN business_type = '' THEN ? ELSE business_type END,
                  follow_up_date = ?, updated_at = ?
                WHERE id = ?`,
          args: [contactName, email, phone, businessType, today, now, leadId] },
        { sql: "INSERT INTO lead_notes (lead_id, content, created_at) VALUES (?, ?, ?)", args: [leadId, summary, now] },
        { sql: "INSERT INTO activities (lead_id, type, description, created_at) VALUES (?, 'website_enquiry', ?, ?)",
          args: [leadId, `${form} via ${channel}${service ? ` - ${service}` : ""}`, now] },
      ];
      await db.batch(stmts, "write");
    } else {
      const order = first(await db.execute("SELECT COALESCE(MIN(sort_order), 0) - 1 AS v FROM leads"));
      const res = await db.execute({
        sql: `INSERT INTO leads (business_name, contact_name, email, phone, business_type, website_status, notes, status,
                follow_up_date, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`,
        args: [company, contactName, email, phone, businessType, websiteAsked && !website ? 1 : 0, leadNote, today,
          Number(order?.v ?? 0), now, now],
      });
      leadId = Number(res.lastInsertRowid);
      await db.batch([
        { sql: "INSERT INTO lead_notes (lead_id, content, created_at) VALUES (?, ?, ?)", args: [leadId, leadNote, now] },
        { sql: "INSERT INTO activities (lead_id, type, description, created_at) VALUES (?, 'website_enquiry', ?, ?)",
          args: [leadId, `${form} via ${channel}${service ? ` - ${service}` : ""}`, now] },
      ], "write");
    }
    if (website) {
      // The URL lives in a custom column ("Current Website" in Prospects),
      // registered on first use. An existing value is never overwritten.
      await db.batch([
        { sql: `INSERT OR IGNORE INTO column_config (id, label, col_type, visible, sort_order)
                SELECT 'custom_current_website', 'Current Website', 'url', 1, COALESCE(MAX(sort_order), 0) + 1 FROM column_config`,
          args: [] },
        { sql: `INSERT INTO custom_field_values (lead_id, field_id, value) VALUES (?, 'custom_current_website', ?)
                ON CONFLICT(lead_id, field_id) DO UPDATE SET value = CASE WHEN value = '' THEN excluded.value ELSE value END`,
          args: [leadId, website] },
      ], "write");
    }
  } catch (err) {
    console.error("site-enquiry insert failed:", err);
    return NextResponse.json({ ok: false, error: "could not save" }, { status: 500, headers });
  }

  // The lead is saved; the alert is best-effort.
  if (isEmailConfigured()) {
    const rows: [string, string][] = [
      ["Name", contactName], ["Business", company], ["Email", email], ["Phone", phone],
      ["Service", service], ["Business type", businessType],
      ["Current website", websiteAsked ? website || "none" : ""], ["Came from", channel], ["UTM", utm], ["Page", page],
    ];
    const known = existing ? `Existing prospect "${String(existing.business_name)}" (stage: ${String(existing.status || "new")})`
      : sameEmail ? `New prospect (this email is already on #${sameEmail.id} "${String(sameEmail.business_name)}")` : "New prospect";
    try {
      await sendEmailWithRetry({
        to: NOTIFY_TO,
        replyTo: email || undefined,
        subject: `${existing ? "Repeat" : "New"} website enquiry: ${company}${service ? ` - ${service}` : ""} (${channel})`,
        text: `${known}\n\n${rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${message}\n\nhttps://crm.innov8workflows.co.uk/`,
        html: `<p><strong>${esc(known)}</strong></p><table cellpadding="4">${rows.filter(([, v]) => v)
          .map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`
          + (message ? `<p style="white-space:pre-wrap">${esc(message)}</p>` : "")
          + `<p><a href="https://crm.innov8workflows.co.uk/">Open the CRM</a></p>`,
      });
    } catch (err) {
      console.error("site-enquiry email failed:", err);
    }
  }

  return NextResponse.json({ ok: true, existing: !!existing }, { headers });
}
