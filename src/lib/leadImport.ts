// Parsing for client-enquiry ingest: the manual "add enquiry" form and the bulk
// import of a client's historical Google Sheet lead log.
//
// This module exists so the import PREVIEW and the import COMMIT cannot drift.
// They are the same route with a dry_run flag and they call the same functions
// here, which is the only way a preview can be trusted to describe what a commit
// will actually write.
//
// The whole file is really about one thing: producing a received_at string that
// clientReporting.ts can bucket. See the contract at clientReporting.ts:15-26 —
// SQLite's datetime('now') writes "YYYY-MM-DD HH:MM:SS" while JS toISOString()
// writes "YYYY-MM-DDTHH:MM:SS.sssZ", ranges are half-open DATE-ONLY bounds, and
// mixing the two formats is a bug that has already shipped once in this codebase.
// A trailing "Z" on received_at ALSO breaks the renderer at
// ClientDashboard.tsx:610, which appends its own "Z" and gets "Invalid Date".

const pad = (n: number) => String(n).padStart(2, "0");

/** The exact "YYYY-MM-DD HH:MM:SS" shape SQLite's datetime('now') writes. */
export function sqlDateTime(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

/**
 * Normalise a received_at supplied by the manual-entry form.
 * Accepts "" (now), "YYYY-MM-DD" (an <input type="date"> value), or a full
 * "YYYY-MM-DD HH:MM:SS". Anything unrecognised falls back to now rather than
 * throwing — a mistyped date must never cost the enquiry.
 *
 * Date-only input gets MIDDAY, not midnight: a row stamped 00:00:00 on the 1st
 * is one timezone slip away from landing in the previous month's report.
 */
export function normaliseReceivedAt(input: string): string {
  if (!input) {
    const now = new Date();
    return sqlDateTime(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
                       now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(input);
  if (!m) return normaliseReceivedAt("");
  return sqlDateTime(+m[1], +m[2], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
}

/**
 * The sheet's Timestamp column arrives as one of three things, and all three
 * are traps:
 *
 *   string  "05/08/2026 09:32:14"  UK DD/MM. NEVER hand this to new Date() —
 *                                  V8 reads it as May 8th, filing the row three
 *                                  months early. Measured, not assumed.
 *   number  46150.397…             Excel serial, from a real .xlsx export, or
 *                                  from a CSV parsed without raw:true.
 *   Date                           if cellDates is ever turned on.
 *
 * All three funnel to naive Y/M/D h:m:s components and then to sqlDateTime().
 * toISOString() is deliberately never called: the lambda runs UTC but Jay's box
 * is Europe/London, so a Date → ISO round trip shifts an hour in dev only —
 * the worst kind of bug, invisible where you test it.
 *
 * Returns null on anything unrecognised so the row is REPORTED, never guessed.
 */
export function parseSheetTimestamp(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Local getters round-trip whatever naive wall-clock time the parser produced.
    return sqlDateTime(v.getFullYear(), v.getMonth() + 1, v.getDate(),
                       v.getHours(), v.getMinutes(), v.getSeconds());
  }

  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Whole days since Excel's 1899-12-30 epoch. Round to the second, or float
    // drift puts one row on :59 and the next on :00 for the same clock time.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400) * 1000);
    return sqlDateTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
                       d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }

  const s = String(v ?? "").trim();
  if (!s) return null;

  // DD/MM/YYYY or DD-MM-YYYY, optional HH:MM[:SS], optional am/pm.
  const uk = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?$/i.exec(s);
  if (uk) {
    const day = +uk[1];
    const mon = +uk[2];
    // A month > 12 means this file is MM/DD after all. Bail loudly rather than
    // swap silently — a wrong month is the only thing that actually matters here.
    if (mon > 12 || mon < 1 || day > 31 || day < 1) return null;
    let h = uk[4] ? +uk[4] : 12;
    const ap = (uk[7] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return sqlDateTime(+uk[3], mon, day, h, uk[5] ? +uk[5] : 0, uk[6] ? +uk[6] : 0);
  }

  // ISO-ish: "2026-08-18 09:32:14" or "2026-08-18T09:32:14Z".
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    return sqlDateTime(+iso[1], +iso[2], +iso[3],
                       iso[4] ? +iso[4] : 12, iso[5] ? +iso[5] : 0, iso[6] ? +iso[6] : 0);
  }

  return null;
}

/**
 * Lowercased sheet header → internal field key.
 *
 * TWO MAPPINGS HERE LOOK WRONG AND ARE NOT. Do not "fix" them:
 *
 *   sheet "Source" → `where` → client_leads.form_name
 *       The house Apps Script writes the ON-PAGE LOCATION into the Source column
 *       ("header", "bottom CTA", "whatsapp widget"). It is not the lead's source.
 *
 *   sheet "Type"   → `type`  → client_leads.source
 *       The live sync sends `source: type.toLowerCase()`, so mapping it this way
 *       is what makes an imported month and a live month produce the same
 *       by_source breakdown in getLeadCounts / the monthly client report.
 */
export const HEADER_MAP: Record<string, string> = {
  "timestamp": "ts", "date": "ts", "date/time": "ts", "datetime": "ts",
  "time": "ts", "received": "ts", "received at": "ts",

  "type": "type", "action": "type", "event": "type", "event type": "type",

  "name": "name", "full name": "name", "contact": "name", "contact name": "name",

  "phone": "phone", "telephone": "phone", "tel": "phone", "mobile": "phone",
  "number": "phone", "phone number": "phone",

  "email": "email", "e-mail": "email", "email address": "email",

  "service": "service", "job": "service", "job type": "service", "enquiry type": "service",

  "details": "details", "message": "details", "enquiry": "details",
  "comments": "details", "notes": "details",

  "page": "page", "url": "page", "page url": "page", "page_url": "page",

  "source": "where", "location": "where", "section": "where",
  "form": "where", "where": "where", "clicked in": "where",
};

/** Remap one raw sheet row onto the internal field keys, ignoring unknown columns. */
export function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const field = HEADER_MAP[key.toLowerCase().trim()];
    // First header wins, so a sheet with both "Message" and "Details" keeps the
    // leftmost rather than whichever happened to be enumerated last.
    if (field && out[field] === undefined) out[field] = row[key];
  }
  return out;
}

/**
 * asText() in the Apps Script prefixes phones with an apostrophe so Sheets stops
 * eating the leading zero of 07877533880. That marker is stripped on export, but
 * defend anyway — and note that parsing a CSV WITHOUT raw:true turns the same
 * value into the number 7878759053, zero gone, which is why the import route
 * forces every CSV cell to a string.
 */
export function cleanPhone(v: unknown): string {
  return String(v ?? "").trim().replace(/^'/, "").slice(0, 60);
}

/**
 * Types that are a tap on a button, not a submitted enquiry.
 *
 * Substring match, deliberately NOT \bclick\b: the sites are not consistent —
 * ASAP sends "WhatsApp click" but JGS sends "whatsapp_click", and an underscore
 * is a word character, so a \b anchor would silently let every JGS click through.
 * This mirrors the live filter in the Apps Script (type.indexOf('click') !== -1).
 */
export function isClickType(type: string): boolean {
  const t = type.toLowerCase();
  return t.indexOf("click") !== -1 || t.indexOf("tap") !== -1;
}
