"use client";

// Has this client said Jay can use their website in his own marketing (ads,
// socials, case studies, the portfolio)? Bottom-right of the Live Clients cover.
//   showcase_ok = 1   green  OK TO SHOWCASE
//   showcase_ok = 0   red    DON'T SHOWCASE
//   showcase_ok NULL  grey   SHOWCASE? (never asked)
// showcase_at is the day the answer was recorded, so "when did they say yes?" has
// an answer. Click opens a small menu rather than cycling, so a stray click can't
// silently flip a client from no to yes.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

type Value = 0 | 1 | null;

const STATES = {
  yes: { label: "OK TO SHOWCASE", colour: "#22c55e", icon: "check" as const },
  no: { label: "DON'T SHOWCASE", colour: "#ef4444", icon: "x-mark" as const },
  ask: { label: "SHOWCASE?", colour: "#94a3b8", icon: "question" as const },
};

export function showcaseState(v: number | null | undefined) {
  return v === 1 ? STATES.yes : v === 0 ? STATES.no : STATES.ask;
}

function fmt(d?: string) {
  if (!d) return "";
  const t = new Date(d + "T12:00:00");
  return isNaN(t.getTime()) ? d : t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ShowcaseBadge({ value, at, name, onSet }: {
  value: number | null | undefined;
  at?: string;
  name?: string;
  onSet: (v: Value) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const s = showcaseState(value);
  const when = fmt(at);
  const title = value === 1
    ? `${name || "This client"} said you can use their site in your own marketing${when ? ` (${when})` : ""}. Click to change.`
    : value === 0
      ? `${name || "This client"} said NOT to use their site in your marketing${when ? ` (${when})` : ""}. Click to change.`
      : "Not asked yet whether you can use this site in your own marketing. Click to record their answer.";

  const choose = (v: Value) => { setOpen(false); if (v !== (value ?? null)) onSet(v); };

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide whitespace-nowrap transition-transform hover:scale-105"
        style={{
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          border: `1px solid ${s.colour}${value == null ? "66" : "aa"}`, color: s.colour,
          boxShadow: value === 1 ? `0 0 10px ${s.colour}66` : undefined,
        }}
      >
        <span className="relative flex" style={{ width: 7, height: 7 }} aria-hidden="true">
          {value === 1 && <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: s.colour, opacity: 0.6 }} />}
          <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: s.colour }} />
        </span>
        {s.label}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-30 rounded-lg p-1.5 shadow-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border-light)", width: 230 }}>
          <div className="px-2 pt-1 pb-1.5 text-[11px] leading-snug" style={{ color: "var(--text-dim)" }}>
            Can you use {name ? <b style={{ color: "var(--text-secondary)" }}>{name}</b> : "this"}&apos;s site in your own marketing?
          </div>
          {([[1, STATES.yes, "Yes, they said OK"], [0, STATES.no, "No, they said not to"], [null, STATES.ask, "Not asked yet"]] as const).map(([v, st, text]) => {
            const active = (value ?? null) === v;
            return (
              <button key={String(v)} role="menuitemradio" aria-checked={active} type="button" onClick={() => choose(v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors"
                style={{ color: active ? st.colour : "var(--text-secondary)", background: active ? `${st.colour}1a` : "transparent", fontWeight: active ? 600 : 400 }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                <span className="flex items-center justify-center rounded-md flex-shrink-0" style={{ width: 20, height: 20, background: `${st.colour}26`, color: st.colour }}>
                  <Icon name={st.icon} className="w-3.5 h-3.5" />
                </span>
                {text}
              </button>
            );
          })}
          {value != null && when && (
            <div className="px-2 pt-1.5 text-[10px]" style={{ color: "var(--text-quaternary)", borderTop: "1px solid var(--border)", marginTop: 4 }}>
              Recorded {when}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
