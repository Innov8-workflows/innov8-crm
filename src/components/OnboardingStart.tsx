"use client";

import { useState } from "react";

// Landing page for the shared link. Two fields, then it mints a private
// resumable link and moves them straight onto the real form.
//
// Colours are explicit rather than CSS variables: the root layout applies Jay's
// saved CRM theme from localStorage, and that must never leak onto a client's
// screen.

const C = {
  bg: "#f6f7f9", card: "#ffffff", ink: "#14181f", dim: "#5b6472",
  line: "#e3e7ec", accent: "#ff6a1f", bad: "#c8321f",
};

export default function OnboardingStart() {
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/onboarding-public/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: business, email }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Something went wrong. Try again."); setBusy(false); return; }
      // Straight onto their own link — bookmarking THIS is what lets them
      // come back to a part-finished form.
      window.location.href = `/onboarding/${d.token}`;
    } catch {
      setError("Couldn't reach us just then. Check your signal and try again.");
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 16,
    border: `1px solid ${C.line}`, borderRadius: 9, marginBottom: 16,
    fontFamily: "inherit", color: C.ink, background: "#fff",
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.ink,
                  padding: "24px 16px 64px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", background: C.card, borderRadius: 14,
                    border: `1px solid ${C.line}`, padding: "26px 20px" }}>
        <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "#8b93a1" }}>
          innov8 Workflows
        </div>
        <h1 style={{ fontSize: 25, margin: "8px 0 10px", lineHeight: 1.2 }}>
          Let&apos;s get your website started
        </h1>
        <p style={{ color: C.dim, lineHeight: 1.65, fontSize: 15, margin: "0 0 22px" }}>
          A few questions about your business, and somewhere to send your photos.
          It takes about fifteen minutes, and you don&apos;t have to do it all in one go —
          you&apos;ll get your own link you can come back to.
        </p>

        <label style={{ display: "block", fontSize: 15, fontWeight: 600, marginBottom: 7 }}>
          Business name
        </label>
        <input value={business} onChange={(e) => setBusiness(e.target.value)}
               placeholder="e.g. XYZ Home Improvements" style={input} />

        <label style={{ display: "block", fontSize: 15, fontWeight: 600, marginBottom: 7 }}>
          Your email
        </label>
        <input value={email} onChange={(e) => setEmail(e.target.value)}
               type="email" inputMode="email" placeholder="you@yourbusiness.co.uk" style={input} />

        {error && <p style={{ color: C.bad, fontSize: 14, margin: "0 0 14px" }}>{error}</p>}

        <button
          onClick={start}
          disabled={busy || business.trim().length < 2 || !email.includes("@")}
          style={{
            width: "100%", padding: "13px 20px", fontSize: 16, fontWeight: 600,
            border: "none", borderRadius: 9, color: "#fff", fontFamily: "inherit",
            background: busy || business.trim().length < 2 || !email.includes("@") ? "#c9ced6" : C.accent,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "One moment…" : "Start"}
        </button>

        <p style={{ color: "#8b93a1", fontSize: 13, lineHeight: 1.55, margin: "16px 0 0" }}>
          Already started? Use the link we sent you rather than starting again,
          so you keep what you&apos;ve already filled in.
        </p>
      </div>
    </div>
  );
}
