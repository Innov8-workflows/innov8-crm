// The monthly client report — pure rendering, no DB access.
//
// Email-client constraints (the same ones LeadGrid's print export lives with,
// only stricter): every style INLINE, hex colours only (no CSS variables, no
// Tailwind — none of it survives), <table> layout because Gmail and Outlook
// strip most <style> blocks and ignore flexbox/grid, progress bars as table
// cells with a background colour and a percentage width (Outlook can't render
// SVG), and no images (blocked by default in most clients).

export interface ReportSnapshot {
  business_name: string;
  contact_name: string;
  period: string;        // 'YYYY-MM'
  period_label: string;  // 'July 2026'
  domain: string;
  leads: { total: number; prev_total: number; unique_contacts: number; by_source: { source: string; count: number }[] };
  site: { page_views: number; unique_visitors: number; calls: number; forms: number; interactions: number; prev_page_views: number };
  seo: { score: number | null; prev_score: number | null };
  objectives: { title: string; target: number; actual: number; pct: number; status: string; unit: string }[];
  note: string;
  agency: { name: string; url: string; reply_to: string };
}

const ACCENT = "#ea580c";
const INK = "#0f0f0f";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const GOOD = "#22c55e";
const WARN = "#f59e0b";
const BAD = "#ef4444";

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const seoColour = (s: number | null) => (s === null ? MUTED : s >= 7 ? GOOD : s >= 4 ? WARN : BAD);

function deltaText(cur: number, prev: number): string {
  if (prev === 0 && cur === 0) return "";
  if (prev === 0) return `<span style="color:${GOOD};font-size:12px;font-weight:600"> new</span>`;
  const diff = cur - prev;
  if (diff === 0) return `<span style="color:${MUTED};font-size:12px"> same as last month</span>`;
  const pct = Math.round((Math.abs(diff) / prev) * 100);
  const colour = diff > 0 ? GOOD : BAD;
  return `<span style="color:${colour};font-size:12px;font-weight:600"> ${diff > 0 ? "▲" : "▼"} ${pct}% vs last month</span>`;
}

export function renderReportSubject(s: ReportSnapshot): string {
  const n = s.leads.total;
  if (n === 0) return `Your ${s.period_label} website report`;
  return `Your ${s.period_label} report — ${n} new enquir${n === 1 ? "y" : "ies"}`;
}

function bigNumberCell(value: string, label: string, sub: string): string {
  return `<td width="50%" style="padding:10px;vertical-align:top">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border:1px solid ${LINE};border-radius:8px">
      <tr><td style="padding:14px 16px">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};font-family:Arial,Helvetica,sans-serif">${esc(label)}</div>
        <div style="font-size:30px;font-weight:700;color:${INK};font-family:Arial,Helvetica,sans-serif;line-height:1.2">${value}</div>
        <div style="font-family:Arial,Helvetica,sans-serif">${sub}</div>
      </td></tr>
    </table>
  </td>`;
}

export function renderReportHtml(s: ReportSnapshot): string {
  const font = "font-family:Arial,Helvetica,sans-serif";

  const kpis = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      ${bigNumberCell(String(s.leads.total), "Enquiries", deltaText(s.leads.total, s.leads.prev_total))}
      ${bigNumberCell(String(s.site.page_views), "Page views", deltaText(s.site.page_views, s.site.prev_page_views))}
    </tr>
    <tr>
      ${bigNumberCell(String(s.site.calls), "Calls from the site", "")}
      ${bigNumberCell(
        s.seo.score === null ? "—" : `<span style="color:${seoColour(s.seo.score)}">${s.seo.score}<span style="font-size:16px;color:${MUTED}">/10</span></span>`,
        "SEO score",
        s.seo.score !== null && s.seo.prev_score !== null ? deltaText(s.seo.score, s.seo.prev_score) : ""
      )}
    </tr>
  </table>`;

  const sources = s.leads.by_source.length > 0 && s.leads.total > 0 ? `
  <h2 style="${font};font-size:15px;color:${INK};margin:26px 0 10px">Where your enquiries came from</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    ${s.leads.by_source.map((src) => {
      const pct = Math.round((src.count / s.leads.total) * 100);
      return `<tr>
        <td width="30%" style="${font};font-size:13px;color:${MUTED};padding:5px 8px 5px 0;text-transform:capitalize">${esc(src.source)}</td>
        <td style="padding:5px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f1f1;border-radius:4px">
            <tr><td width="${pct}%" style="background:${ACCENT};height:14px;border-radius:4px;font-size:1px;line-height:14px">&nbsp;</td><td>&nbsp;</td></tr>
          </table>
        </td>
        <td width="40" style="${font};font-size:13px;font-weight:700;color:${INK};text-align:right;padding:5px 0 5px 8px">${src.count}</td>
      </tr>`;
    }).join("")}
  </table>` : "";

  const objectives = s.objectives.length > 0 ? `
  <h2 style="${font};font-size:15px;color:${INK};margin:26px 0 10px">This month's objectives</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    ${s.objectives.map((o) => {
      const done = o.status === "done" || (o.target > 0 && o.actual >= o.target);
      const colour = done ? GOOD : ACCENT;
      const right = o.target > 0 ? `${o.actual} / ${o.target}${o.unit ? " " + esc(o.unit) : ""}` : (done ? "Done" : "In progress");
      return `<tr><td style="padding:7px 0;border-bottom:1px solid ${LINE}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="${font};font-size:13px;color:${INK};padding-bottom:5px">${done ? `<span style="color:${GOOD};font-weight:700">✓</span> ` : ""}${esc(o.title)}</td>
            <td style="${font};font-size:12px;font-weight:700;color:${done ? GOOD : MUTED};text-align:right;padding-bottom:5px">${esc(right)}</td>
          </tr>
          ${o.target > 0 ? `<tr><td colspan="2">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f1f1;border-radius:3px">
              <tr><td width="${Math.max(1, o.pct)}%" style="background:${colour};height:6px;border-radius:3px;font-size:1px;line-height:6px">&nbsp;</td><td>&nbsp;</td></tr>
            </table>
          </td></tr>` : ""}
        </table>
      </td></tr>`;
    }).join("")}
  </table>` : "";

  const note = s.note.trim() ? `
  <h2 style="${font};font-size:15px;color:${INK};margin:26px 0 10px">What we did this month</h2>
  <div style="${font};font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap">${esc(s.note.trim())}</div>` : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f6f6;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 24px;border-bottom:3px solid ${ACCENT}">
        <div style="${font};font-size:12px;font-weight:700;color:${ACCENT};letter-spacing:.06em;text-transform:uppercase">${esc(s.agency.name)}</div>
        <div style="${font};font-size:21px;font-weight:700;color:${INK};margin-top:3px">${esc(s.business_name)}</div>
        <div style="${font};font-size:13px;color:${MUTED};margin-top:2px">Website performance — ${esc(s.period_label)}</div>
      </td></tr>
      <tr><td style="padding:16px 14px 4px">
        ${s.contact_name ? `<p style="${font};font-size:13px;color:#374151;margin:6px 10px 14px;line-height:1.6">Hi ${esc(s.contact_name.split(" ")[0])}, here's how your website performed in ${esc(s.period_label)}.</p>` : ""}
        ${kpis}
      </td></tr>
      <tr><td style="padding:0 24px 24px">
        ${sources}
        ${objectives}
        ${note}
      </td></tr>
      <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid ${LINE}">
        <div style="${font};font-size:12px;color:${MUTED};line-height:1.6">
          Questions about anything in here? Just reply to this email.<br>
          ${esc(s.agency.name)} — <a href="${esc(s.agency.url)}" style="color:${ACCENT};text-decoration:none">${esc(s.agency.url.replace(/^https?:\/\//, ""))}</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

/** Plain-text alternative — materially helps deliverability. */
export function renderReportText(s: ReportSnapshot): string {
  const lines: string[] = [];
  lines.push(`${s.business_name} — website performance, ${s.period_label}`, "");
  lines.push(`Enquiries: ${s.leads.total} (last month: ${s.leads.prev_total})`);
  lines.push(`Page views: ${s.site.page_views} (last month: ${s.site.prev_page_views})`);
  lines.push(`Calls from the site: ${s.site.calls}`);
  lines.push(`SEO score: ${s.seo.score === null ? "not scored yet" : `${s.seo.score}/10`}`);
  if (s.leads.by_source.length > 0) {
    lines.push("", "Where your enquiries came from:");
    for (const src of s.leads.by_source) lines.push(`  - ${src.source}: ${src.count}`);
  }
  if (s.objectives.length > 0) {
    lines.push("", "This month's objectives:");
    for (const o of s.objectives) {
      const done = o.status === "done" || (o.target > 0 && o.actual >= o.target);
      lines.push(`  ${done ? "[done]" : "[    ]"} ${o.title}${o.target > 0 ? ` — ${o.actual}/${o.target}${o.unit ? " " + o.unit : ""}` : ""}`);
    }
  }
  if (s.note.trim()) lines.push("", "What we did this month:", s.note.trim());
  lines.push("", "Questions? Just reply to this email.", `${s.agency.name} — ${s.agency.url}`);
  return lines.join("\n");
}
