"use client";

// SECURITY PASS / SECURITY FAIL on the Projects and Live Clients cards. Set only by
// the site-security skill's live scans (never hand-ticked): a pass certificate or a
// failed-scan report on the card's Security tab, newest per host wins
// (src/lib/securityStatus.ts). No label = the live site has never been scanned.
import type { Project } from "@/types";

export default function SecurityBadge({ status, overlay = false }: { status: Project["security_status"]; overlay?: boolean }) {
  if (!status?.r) return null;
  const pass = status.r === "pass";
  const when = status.d ? new Date(status.d).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" }) : "";
  const title = pass
    ? `Website security check passed${status.h ? ` on ${status.h}` : ""}${when ? `, ${when}` : ""}. Certificate on the Security tab.`
    : `Website security check FAILED${status.h ? ` on ${status.h}` : ""}${when ? `, ${when}` : ""}: S1 ${status.s1 ?? 0} · S2 ${status.s2 ?? 0}. Findings and a fix prompt on the Security tab.`;
  const colour = pass ? "#22c55e" : "#ef4444";
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide whitespace-nowrap"
      style={overlay
        ? { background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", border: `1px solid ${colour}88`, color: colour }
        : { background: `${colour}1f`, border: `1px solid ${colour}66`, color: colour }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: "11px", height: "11px" }} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        {pass
          ? <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
          : <><path strokeLinecap="round" d="M12 8v4" /><path strokeLinecap="round" d="M12 16h.01" /></>}
      </svg>
      {pass ? "SECURITY PASS" : "SECURITY FAIL"}
    </span>
  );
}
