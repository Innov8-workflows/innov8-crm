"use client";

// Shared brand furniture for the two client-facing onboarding pages.
//
// The palette and type are lifted from the real Innov8 documents — the pricing
// deck and the website-package one-pager — rather than invented, so the form a
// client fills in looks like the quote they were just sent. Colours were read
// straight out of those PDFs' content streams: ink #14161a, accent #f47b20 with
// #c95a05 for the pressed state, and the warm off-white paper family
// #f7f5f2 / #edebe7 / #e3e1dd that the decks use instead of a cold grey.
//
// Bricolage Grotesque is the brand face and is ALREADY self-hosted by the root
// layout (next/font, --font-bricolage), so using it here costs no extra request
// and cannot fall back to Arial the way a webfont link would.
//
// Every colour is explicit. The root layout applies Jay's saved CRM theme from
// localStorage, and a client must never see the dark internal tool by accident.

export const B = {
  ink: "#14161a",
  inkSoft: "#33373d",
  body: "#5a5f67",
  muted: "#8a9099",
  faint: "#b9bec5",
  accent: "#f47b20",
  accentDeep: "#c95a05",
  accentWash: "#fdf1e7",
  paper: "#f7f5f2",
  card: "#ffffff",
  line: "#e3e1dd",
  lineSoft: "#edebe7",
  good: "#12885a",
  bad: "#c8321f",
};

export const display = "var(--font-bricolage), ui-sans-serif, system-ui, sans-serif";

/** Small wide-tracked uppercase label, the way every section opens in the decks. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
      textTransform: "uppercase", color: B.muted,
    }}>{children}</div>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: B.ink, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: display, fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em",
        flexShrink: 0,
      }}>
        i<span style={{ color: B.accent }}>8</span>
      </div>
      <div style={{ lineHeight: 1.04 }}>
        <div style={{
          fontFamily: display, fontWeight: 800, fontSize: 13.5,
          letterSpacing: "0.02em", color: B.ink,
        }}>
          INNOV<span style={{ color: B.accent }}>8</span>
        </div>
        <div style={{
          fontFamily: display, fontWeight: 700, fontSize: 10,
          letterSpacing: "0.18em", color: B.muted,
        }}>WORKFLOWS</div>
      </div>
      {!compact && (
        <div style={{
          marginLeft: "auto", fontSize: 11.5, color: B.muted, textAlign: "right",
          lineHeight: 1.5, maxWidth: 190,
        }}>
          Smart websites. Strong brands.<br />Real results.
        </div>
      )}
    </div>
  );
}

/**
 * The page frame. Focus and placeholder styling has to be real CSS rather than
 * inline styles, so it ships as one scoped block here instead of being repeated.
 */
export function Frame({ children, maxWidth = 660 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{
      minHeight: "100dvh", background: B.paper, color: B.ink,
      padding: "22px 16px 56px", boxSizing: "border-box",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    }}>
      <style>{`
        .ob-field {
          width: 100%; box-sizing: border-box; padding: 12px 13px;
          font-size: 16px; font-family: inherit; color: ${B.ink};
          background: #fff; border: 1px solid #dcd8d2; border-radius: 10px;
          outline: none; transition: border-color .12s, box-shadow .12s;
          -webkit-appearance: none; appearance: none;
        }
        .ob-field::placeholder { color: ${B.faint}; }
        .ob-field:focus {
          border-color: ${B.accent};
          box-shadow: 0 0 0 3px rgba(244,123,32,0.14);
        }
        .ob-btn {
          font-family: inherit; font-weight: 600; font-size: 15.5px;
          border-radius: 10px; cursor: pointer; border: 1px solid transparent;
          padding: 12px 22px; transition: background .12s, border-color .12s;
        }
        .ob-btn-primary { background: ${B.accent}; color: #fff; }
        .ob-btn-primary:hover:not(:disabled) { background: ${B.accentDeep}; }
        .ob-btn-primary:disabled { background: #d8d4ce; cursor: default; }
        .ob-btn-ghost { background: transparent; color: ${B.body}; border-color: ${B.line}; }
        .ob-btn-ghost:hover { border-color: ${B.muted}; }
        .ob-drop {
          display: block; border: 1.5px dashed #d9d4cd; border-radius: 12px;
          padding: 20px 14px; text-align: center; cursor: pointer;
          background: #fcfbf9; transition: border-color .12s, background .12s;
        }
        .ob-drop:hover { border-color: ${B.accent}; background: ${B.accentWash}; }
      `}</style>
      <div style={{ maxWidth, margin: "0 auto" }}>
        {children}
        <div style={{
          textAlign: "center", marginTop: 20, fontSize: 11.5, color: B.faint,
          letterSpacing: "0.01em",
        }}>
          Innov8 Workflows · Smart websites. Strong brands. Real results.
        </div>
      </div>
    </div>
  );
}

/** The white sheet everything sits on. */
export function Card({ children, pad = 26 }: { children: React.ReactNode; pad?: number }) {
  return (
    <div style={{
      background: B.card, borderRadius: 16, border: `1px solid ${B.line}`,
      padding: `${pad}px 22px`, boxShadow: "0 1px 2px rgba(20,22,26,0.04), 0 8px 24px rgba(20,22,26,0.05)",
    }}>{children}</div>
  );
}
