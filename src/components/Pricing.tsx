"use client";

import Icon from "./Icon";

// The Pricing tab: the official 2026 pricing PDF, exactly as prospects receive it.
// The product picker on client cards uses the same prices (seeded from this PDF
// in src/lib/db.ts, CATALOGUE_2026).
//
// The file lives in /public/pricing. It is NOT public on the live site: the
// middleware only lets images through without a login, so a .pdf needs the
// session cookie, which the same-origin iframe sends.
//
// To update for a new price list: replace public/pricing/innov8-pricing-2026.pdf
// (or add a new file and change PDF below), and update CATALOGUE_2026 to match.

const PDF = "/pricing/innov8-pricing-2026.pdf";

export default function Pricing() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap flex-shrink-0"
        style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <Icon name="currency-pound" className="w-5 h-5" style={{ color: "var(--accent)" }} />
        <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>Pricing</h1>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>2026 rates · the price list prospects receive</span>
        <div className="ml-auto flex items-center gap-2">
          <a href={PDF} target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
            Open in new tab
          </a>
          <a href={PDF} download="Innov8-Workflows-Pricing-2026.pdf"
            className="text-sm font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--accent)", color: "#fff" }}>
            Download PDF
          </a>
        </div>
      </div>
      <div className="flex-1 min-h-0" style={{ background: "var(--bg)" }}>
        <iframe src={`${PDF}#view=FitH&toolbar=1`} title="Innov8 Workflows pricing 2026"
          className="w-full h-full block" style={{ border: 0, minHeight: 600 }} />
      </div>
    </div>
  );
}
