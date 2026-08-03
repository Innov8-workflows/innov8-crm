"use client";

// Site-health dot for the Live Clients cards. Green = responding, amber = slow
// or a certificate expiring soon, red = down, grey = not checked yet.
//
// Cards are draggable AND click-to-open, so — exactly as SetupPills does — both
// mousedown and click are stopped here, otherwise clicking the badge starts a
// drag or opens the project modal.

const CERT_WARN_DAYS = 30;

export interface HealthValues {
  health_status?: string;
  health_checked_at?: string;
  health_status_code?: number;
  health_response_ms?: number;
  health_error?: string;
  ssl_expires_at?: string;
}

function daysUntil(isoDate: string): number | null {
  if (!isoDate) return null;
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (isNaN(then)) return null;
  const now = new Date();
  return Math.round((then - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
}

function ago(iso: string): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "never";
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Colour + label for a project's current health. Exported so the Site Health
 *  view renders identical wording to the card badge. */
export function healthMeta(v: HealthValues): { color: string; label: string; title: string } {
  const certDays = daysUntil(v.ssl_expires_at || "");
  const certExpiring = certDays !== null && certDays <= CERT_WARN_DAYS;
  const checked = `Checked ${ago(v.health_checked_at || "")}`;
  const certLine = certDays === null
    ? ""
    : certDays < 0
      ? ` · Certificate EXPIRED ${Math.abs(certDays)}d ago`
      : ` · Certificate expires in ${certDays}d`;

  if (v.health_status === "down") {
    return {
      color: "#ef4444",
      label: "Down",
      title: `Site not responding — ${v.health_error || `HTTP ${v.health_status_code || "?"}`}. ${checked}${certLine}`,
    };
  }
  if (v.health_status === "slow") {
    return { color: "#f59e0b", label: "Slow", title: `Responding slowly (${v.health_response_ms}ms). ${checked}${certLine}` };
  }
  if (v.health_status === "up") {
    if (certExpiring) {
      return { color: "#f59e0b", label: "Cert", title: `Site is up (${v.health_response_ms}ms), but the certificate needs attention. ${checked}${certLine}` };
    }
    return { color: "#22c55e", label: "Up", title: `Site is up (${v.health_response_ms}ms). ${checked}${certLine}` };
  }
  return { color: "var(--text-quaternary)", label: "—", title: "Not checked yet" };
}

export default function HealthBadge({ values, compact = false }: { values: HealthValues; compact?: boolean }) {
  const { color, label, title } = healthMeta(values);
  return (
    <span
      title={title}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{
        background: color === "var(--text-quaternary)" ? "var(--surface2)" : `${color}22`,
        color: color === "var(--text-quaternary)" ? "var(--text-dim)" : color,
        border: `1px solid ${color === "var(--text-quaternary)" ? "var(--border)" : `${color}55`}`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {!compact && label}
    </span>
  );
}
