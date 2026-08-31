"use client";

import { useState } from "react";
import { B, display, Eyebrow, Wordmark, Frame, Card } from "./OnboardingBrand";

// Landing page for the shared link. Two fields, then it mints a private
// resumable link and moves them onto the real form.
//
// Styled to match the pricing deck and the website-package one-pager, because
// this is often the first Innov8 page a prospect sees after the quote — the
// three reassurance points below are lifted from that one-pager for the same
// reason ("No lock-in", "It stays yours", "Live in 7 business days").

const POINTS: [string, string][] = [
  ["Takes about fifteen minutes", "And you don't have to do it in one go."],
  ["Your own link", "Come back to it whenever — nothing is lost."],
  ["Send photos straight off your phone", "As many as you like, any size."],
];

export default function OnboardingStart() {
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = business.trim().length >= 2 && /\S+@\S+\.\S+/.test(email);

  async function start() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/onboarding-public/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: business, email }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Something went wrong. Try again."); setBusy(false); return; }
      // Straight onto their own link — bookmarking THIS is what lets them come
      // back to a part-finished form.
      window.location.href = `/onboarding/${d.token}`;
    } catch {
      setError("Couldn't reach us just then. Check your signal and try again.");
      setBusy(false);
    }
  }

  return (
    <Frame maxWidth={560}>
      <div style={{ marginBottom: 18 }}><Wordmark /></div>

      <Card>
        <Eyebrow>Website onboarding</Eyebrow>
        <h1 style={{
          fontFamily: display, fontWeight: 800, fontSize: 30, lineHeight: 1.12,
          letterSpacing: "-0.02em", color: B.ink, margin: "10px 0 12px",
        }}>
          Let&apos;s get your website started.
        </h1>
        <p style={{ color: B.body, lineHeight: 1.65, fontSize: 15.5, margin: "0 0 24px" }}>
          A few questions about your business, and somewhere to send your photos.
          That&apos;s everything we need to build it.
        </p>

        <label htmlFor="ob-biz" style={{ display: "block", fontSize: 15, fontWeight: 600, marginBottom: 7 }}>
          Business name
        </label>
        <input id="ob-biz" className="ob-field" value={business} autoComplete="organization"
               onChange={(e) => setBusiness(e.target.value)}
               placeholder="e.g. XYZ Home Improvements" style={{ marginBottom: 16 }} />

        <label htmlFor="ob-email" style={{ display: "block", fontSize: 15, fontWeight: 600, marginBottom: 7 }}>
          Your email
        </label>
        <input id="ob-email" className="ob-field" value={email} type="email" inputMode="email"
               autoComplete="email" onChange={(e) => setEmail(e.target.value)}
               placeholder="you@yourbusiness.co.uk" style={{ marginBottom: 20 }} />

        {error && (
          <p style={{ color: B.bad, fontSize: 14, margin: "0 0 14px", lineHeight: 1.5 }}>{error}</p>
        )}

        <button className="ob-btn ob-btn-primary" onClick={start} disabled={busy || !ready}
                style={{ width: "100%" }}>
          {busy ? "One moment…" : "Start"}
        </button>

        <p style={{ color: B.muted, fontSize: 13, lineHeight: 1.55, margin: "16px 0 0" }}>
          Already started? Use the link we sent you rather than starting again, so you
          keep what you&apos;ve already filled in.
        </p>
      </Card>

      <div style={{ marginTop: 18, display: "grid", gap: 1, background: B.line,
                    border: `1px solid ${B.line}`, borderRadius: 12, overflow: "hidden" }}>
        {POINTS.map(([title, sub]) => (
          <div key={title} style={{ background: B.card, padding: "13px 16px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span style={{ color: B.accent, fontWeight: 700, fontSize: 13 }}>—</span>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: B.ink }}>{title}</div>
                <div style={{ fontSize: 13.5, color: B.body, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}
