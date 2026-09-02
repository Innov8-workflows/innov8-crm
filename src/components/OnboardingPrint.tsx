"use client";

import { useEffect, useState } from "react";
import { SECTIONS, FIELDS } from "@/lib/onboardingSchema";
import { B, display } from "./OnboardingBrand";

// A print-ready view of one submission, opened in its own tab from the CRM.
//
// Printed to PDF by the browser rather than rendered server-side: a real PDF
// library means a chromium binary in the Vercel bundle, and the house rule is no
// new dependencies in the deploy clone (see the raw-fetch note in email.ts).
// Chrome's own PDF export is good, and this way the page is also just readable
// on screen.
//
// It lives at /onboarding-print/<id>, a SIBLING of the public /onboarding/
// route rather than a child — PUBLIC_PATHS is matched with startsWith, so a
// path under /onboarding/ would have been served to anyone with the URL. This
// one stays behind the session check like the rest of the CRM.

interface Asset {
  id: number; role: string; original_name: string; caption: string;
  content_type: string; actual_size: number; status: string; url: string | null;
}
interface Data {
  submission: { id: number; business_name: string; status: string; created_at: string;
                submitted_at: string; project_id: number | null };
  answers: Record<string, unknown>;
  assets: Asset[];
  missing: { id: string; label: string }[];
  confirm: { id: string; label: string; value: string }[];
}

const val = (v: unknown) =>
  Array.isArray(v) ? v.join(", ") : String(v ?? "").trim();

export default function OnboardingPrint({ id }: { id: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`/api/onboarding/submissions/${id}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setD(j)))
      .catch(() => setErr("Couldn't load that submission."));
  }, [id]);

  // Deliberately does NOT print on load.
  //
  // This is a document Jay may hand to someone, so he should see it before it
  // becomes a PDF. Auto-printing also opens a modal dialog the moment the page
  // appears, which blocks the page entirely — you cannot even read what you are
  // about to send. The button in the bar does it when he is ready.

  if (err) return <div style={{ padding: 40, fontFamily: "system-ui" }}>{err}</div>;
  if (!d) return <div style={{ padding: 40, fontFamily: "system-ui", color: B.muted }}>Loading…</div>;

  const photos = d.assets.filter((a) => a.status === "stored" && a.content_type.startsWith("image/"));
  const others = d.assets.filter((a) => a.status === "stored" && !a.content_type.startsWith("image/"));

  return (
    <div style={{ background: "#fff", color: B.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          .no-print { display: none !important; }
          /* A section split across a page break is the main thing that makes a
             printed record hard to read, so keep each block whole. */
          .blk { break-inside: avoid; page-break-inside: avoid; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .blk { break-inside: avoid; }
      `}</style>

      <div className="no-print" style={{ position: "sticky", top: 0, background: B.paper,
             borderBottom: `1px solid ${B.line}`, padding: "10px 16px", display: "flex",
             alignItems: "center", gap: 12, fontSize: 13, color: B.body }}>
        <button onClick={() => window.print()}
          style={{ background: B.accent, color: "#fff", border: "none", borderRadius: 8,
                   padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          Print / Save as PDF
        </button>
        <span>In the print dialog choose <strong>Save as PDF</strong> as the destination.</span>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "26px 22px 40px" }}>
        {/* header */}
        <div className="blk" style={{ display: "flex", alignItems: "flex-start", gap: 12,
               borderBottom: `2px solid ${B.ink}`, paddingBottom: 14, marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/innov8-mark.png" alt="" width={40} height={40} style={{ borderRadius: 9 }} />
          <div>
            <div style={{ fontFamily: display, fontWeight: 800, fontSize: 14, letterSpacing: "0.02em" }}>
              INNOV<span style={{ color: B.accent }}>8</span> WORKFLOWS
            </div>
            <div style={{ fontSize: 11, color: B.muted, letterSpacing: "0.02em" }}>
              Website onboarding · submission #{d.submission.id}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: B.muted, lineHeight: 1.6 }}>
            {d.submission.submitted_at
              ? <>Sent {String(d.submission.submitted_at).slice(0, 10)}<br /></>
              : <>Not yet sent<br /></>}
            Started {String(d.submission.created_at).slice(0, 10)}
          </div>
        </div>

        <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 30, lineHeight: 1.1,
               letterSpacing: "-0.02em", margin: "0 0 22px" }}>
          {d.submission.business_name || "Unnamed"}
        </h1>

        {d.missing.length > 0 && (
          <div className="blk" style={{ border: `1px solid ${B.line}`, borderLeft: `3px solid ${B.accent}`,
                 borderRadius: 6, padding: "10px 13px", marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
                   textTransform: "uppercase", color: B.accent, marginBottom: 3 }}>
              Still missing ({d.missing.length})
            </div>
            <div style={{ fontSize: 13, color: B.body }}>{d.missing.map((m) => m.label).join(" · ")}</div>
          </div>
        )}

        {d.confirm.length > 0 && (
          <div className="blk" style={{ border: `1px solid ${B.line}`, borderRadius: 6,
                 padding: "10px 13px", marginBottom: 22 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
                   textTransform: "uppercase", color: B.muted, marginBottom: 5 }}>
              Confirm before it goes on the site
            </div>
            {d.confirm.map((c) => (
              <div key={c.id} style={{ fontSize: 13, color: B.body, marginBottom: 2 }}>
                <span style={{ color: B.muted }}>{c.label}:</span> <strong>{c.value}</strong>
              </div>
            ))}
            <div style={{ fontSize: 11, color: B.muted, marginTop: 5, lineHeight: 1.5 }}>
              The client&apos;s own words. Nothing here goes on the site until the certificate has been seen.
            </div>
          </div>
        )}

        {/* the answers, in the order the form asks them */}
        {SECTIONS.map((s) => {
          const filled = s.fields.filter((f) => f.type !== "upload" && val(d.answers[f.id]) !== "");
          const repeats = Object.keys(d.answers).filter(
            (k) => k.includes("__") && s.fields.some((f) => k.startsWith(f.id + "__")) && val(d.answers[k]) !== "");
          if (!filled.length && !repeats.length) return null;
          return (
            <div key={s.id} className="blk" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
                     textTransform: "uppercase", color: B.muted, borderBottom: `1px solid ${B.line}`,
                     paddingBottom: 5, marginBottom: 9 }}>
                {s.title}
              </div>
              {filled.map((f) => (
                <div key={f.id} style={{ display: "flex", gap: 14, marginBottom: 7, fontSize: 13 }}>
                  <div style={{ width: 190, flexShrink: 0, color: B.muted, lineHeight: 1.45 }}>{f.label}</div>
                  <div style={{ flex: 1, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{val(d.answers[f.id])}</div>
                </div>
              ))}
              {repeats.map((k) => (
                <div key={k} style={{ display: "flex", gap: 14, marginBottom: 7, fontSize: 13 }}>
                  <div style={{ width: 190, flexShrink: 0, color: B.muted, lineHeight: 1.45 }}>
                    {FIELDS[k.split("__")[0]]?.label.replace("{{line}}", `#${Number(k.split("__")[1]) + 1}`) || k}
                  </div>
                  <div style={{ flex: 1, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{val(d.answers[k])}</div>
                </div>
              ))}
            </div>
          );
        })}

        {/* contact sheet — what they actually sent */}
        {photos.length > 0 && (
          <div className="blk" style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
                   textTransform: "uppercase", color: B.muted, borderBottom: `1px solid ${B.line}`,
                   paddingBottom: 5, marginBottom: 10 }}>
              Photos ({photos.length}){others.length ? ` · plus ${others.length} other file${others.length === 1 ? "" : "s"}` : ""}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {photos.map((a) => (
                <div key={a.id} className="blk" style={{ width: 116 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url || ""} alt={a.caption || a.original_name}
                       style={{ width: "100%", height: 84, objectFit: "cover",
                                border: `1px solid ${B.line}`, borderRadius: 4, display: "block" }} />
                  <div style={{ fontSize: 9.5, color: B.muted, marginTop: 3, lineHeight: 1.35 }}>
                    {a.role.replace(/_/g, " ")}{a.caption ? ` — ${a.caption}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 26, paddingTop: 10, borderTop: `1px solid ${B.line}`,
               fontSize: 10.5, color: B.faint, textAlign: "center" }}>
          Innov8 Workflows · Smart websites. Strong brands. Real results.
        </div>
      </div>
    </div>
  );
}
