"use client";

// Three foundational setup milestones tracked per project/client, rendered as
// click-to-toggle pills on the Kanban + Live Clients cards. Green = done.
// Label is "Business Profile" (not "GBP") to avoid clashing with £ on the cards.
const SETUP_ITEMS = [
  { field: "ga4_embedded", label: "GA4", title: "Google Analytics 4 embedded" },
  { field: "ga4_conversions", label: "GA4 Conversions", title: "GA4 conversion events / key events configured" },
  { field: "search_console_verified", label: "Search Console", title: "Google Search Console verified" },
  { field: "gbp_setup", label: "Business Profile", title: "Google Business Profile set up" },
  { field: "mobile_optimised", label: "Mobile", title: "Site is mobile-optimised" },
] as const;

export type SetupField = (typeof SETUP_ITEMS)[number]["field"];

export default function SetupPills({ values, onToggle }: {
  values: { ga4_embedded?: number; ga4_conversions?: number; search_console_verified?: number; gbp_setup?: number; mobile_optimised?: number };
  onToggle: (field: SetupField, next: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 mt-2">
      {SETUP_ITEMS.map(({ field, label, title }) => {
        const on = !!values[field];
        return (
          <button
            key={field}
            title={title}
            draggable={false}
            // Cards are draggable + click-to-open — keep both off the pill.
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggle(field, on ? 0 : 1); }}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors"
            style={{
              background: on ? "#22c55e22" : "var(--surface2)",
              color: on ? "#16a34a" : "var(--text-dim)",
              border: `1px solid ${on ? "#22c55e55" : "var(--border)"}`,
            }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: "11px", height: "11px",
                background: on ? "#22c55e" : "transparent",
                border: on ? "none" : "1px solid var(--text-quaternary)",
              }}
            >
              {on && (
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} style={{ width: "8px", height: "8px" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
