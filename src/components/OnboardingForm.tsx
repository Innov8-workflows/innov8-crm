"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SECTIONS, FIELDS, REQUIRED, type Field, type Section } from "@/lib/onboardingSchema";
import { B, display, Eyebrow, Wordmark, Frame, Card } from "./OnboardingBrand";

// The client-facing onboarding form.
//
// Phone-first: the reader is a roofer standing in a yard on 4G, not Jay at a
// desk. Section at a time rather than one 69-question page, because a long
// scroll on a phone reads as "this will take an hour" and gets abandoned.
//
// Self-contained styling. The root layout applies Jay's saved CRM theme from
// localStorage, which must not leak onto a client's screen, so every colour
// here is explicit rather than a CSS variable.
//
// TWO FAILURE DOMAINS, KEPT APART. Text autosaves on its own (debounce + blur +
// visibilitychange) and shares nothing with the media path — losing typed
// answers because a video upload failed is the fastest way to lose someone.
//
// XHR, NOT FETCH, for the uploads: fetch() has no upload progress event and
// streaming request bodies don't exist in iOS Safari, which is the majority
// browser here. xhr.upload.onprogress gives byte-accurate progress and abort()
// actually works.

// Mapped onto the shared brand tokens, which were read out of the real Innov8
// pricing deck and website-package one-pager — so the form a client fills in
// looks like the quote they were just sent, and the two pages cannot drift.
const C = {
  bg: B.paper, card: B.card, ink: B.ink, dim: B.body, faint: B.muted,
  line: B.line, accent: B.accent, accentInk: "#ffffff",
  good: B.good, bad: B.bad, warnBg: B.accentWash,
};

const MAX_TRIES = 5;
const CONCURRENCY = 3;

interface Asset {
  id: number; role: string; pair_id: string; sort_order: number;
  original_name: string; content_type: string; caption: string;
  declared_size: number; actual_size: number; status: string;
  parts_done: number; parts_total: number; part_size: number;
}
interface Progress { name: string; pct: number; error?: string }

type Answers = Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One PUT with progress. Resolves with the ETag, which multipart completion needs. */
function xhrPut(
  url: string, body: Blob | File, contentType: string | null,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Readable only because the bucket CORS policy sets
        // ExposeHeaders: ["ETag"]. Without it multipart cannot be completed.
        resolve(xhr.getResponseHeader("ETag") || "");
      } else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.send(body);
  });
}

export default function OnboardingForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [business, setBusiness] = useState("");
  const [status, setStatus] = useState("open");
  const [answers, setAnswers] = useState<Answers>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [online, setOnline] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const answersRef = useRef<Answers>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // ---- load -------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/onboarding-public/state?token=${encodeURIComponent(token)}`);
        if (!res.ok) { setGone(true); setLoading(false); return; }
        const d = await res.json();
        setBusiness(d.business_name || "");
        setStatus(d.status);
        setSubmitted(d.status !== "open");
        setAnswers(d.answers || {});
        answersRef.current = d.answers || {};
        setAssets(d.assets || []);
      } catch { setGone(true); }
      setLoading(false);
    })();
  }, [token]);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ---- autosave ---------------------------------------------------------
  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSaving("saving");
    try {
      await fetch("/api/onboarding-public/answers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers: answersRef.current }),
      });
      setSaving("saved");
    } catch { setSaving("idle"); dirty.current = true; }
  }, [token]);

  useEffect(() => {
    // Also on tab-hide: a phone user switching to their camera roll is the most
    // common way this page goes to the background mid-answer.
    const vis = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [save]);

  const setAnswer = (id: string, value: unknown) => {
    answersRef.current = { ...answersRef.current, [id]: value };
    setAnswers(answersRef.current);
    dirty.current = true;
    setSaving("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  };

  // ---- uploads ----------------------------------------------------------
  const api = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/onboarding-public/upload", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }, [token]);

  const uploadOne = useCallback(async (file: File, field: Field, sortOrder: number, pairId = "") => {
    const tmp = `${field.id}:${file.name}:${file.size}`;
    const mark = (pct: number, error?: string) =>
      setProgress((p) => ({ ...p, [tmp]: { name: file.name, pct, error } }));
    mark(0);

    try {
      const begun = await api({
        action: "begin", role: field.upload!.role, filename: file.name,
        size: file.size, sort_order: sortOrder, pair_id: pairId,
      });

      if (begun.mode === "put") {
        await withRetry(() => xhrPut(begun.url, file, begun.content_type,
          (l, t) => mark(Math.round((l / t) * 95))));
      } else {
        const partSize: number = begun.part_size;
        const total: number = begun.parts_total;
        const doneBytes = { n: 0 };
        let next = 1;
        while (next <= total) {
          // Minted in batches: presigning is free, but a URL cut at the start of
          // a 90-minute upload would be stale long before the last part.
          const { urls } = await api({ action: "parts", asset_id: begun.asset_id, from: next, count: 8 });
          if (!urls?.length) throw new Error("no part urls");
          const queue = [...urls] as { part_number: number; url: string }[];
          const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
            for (;;) {
              const job = queue.shift();
              if (!job) return;
              const start = (job.part_number - 1) * partSize;
              const chunk = file.slice(start, Math.min(start + partSize, file.size));
              let last = 0;
              const etag = await withRetry(() => xhrPut(job.url, chunk, null, (l) => {
                doneBytes.n += l - last; last = l;
                mark(Math.min(95, Math.round((doneBytes.n / file.size) * 95)));
              }), () => { doneBytes.n -= last; last = 0; });
              await api({ action: "part-done", asset_id: begun.asset_id,
                          part_number: job.part_number, etag, size: chunk.size });
            }
          });
          await Promise.all(workers);
          next += urls.length;
        }
      }

      await api({ action: "complete", asset_id: begun.asset_id });
      mark(100);
      const state = await fetch(`/api/onboarding-public/state?token=${encodeURIComponent(token)}`).then((r) => r.json());
      setAssets(state.assets || []);
      setTimeout(() => setProgress((p) => { const n = { ...p }; delete n[tmp]; return n; }), 1200);
    } catch (e) {
      mark(0, (e as Error).message);
    }
  }, [api, token]);

  const onPick = useCallback(async (field: Field, files: FileList | null) => {
    if (!files?.length) return;
    const existing = assets.filter((a) => a.role === field.upload!.role).length;
    const list = Array.from(files);
    // Before/after go up two at a time and stay linked by a shared pair id.
    if (field.upload!.paired) {
      for (let i = 0; i < list.length; i += 2) {
        const pid = `p${Date.now()}${i}`;
        await uploadOne(list[i], field, existing + i, pid);
        if (list[i + 1]) await uploadOne(list[i + 1], field, existing + i + 1, pid);
      }
      return;
    }
    for (let i = 0; i < list.length; i++) await uploadOne(list[i], field, existing + i);
  }, [assets, uploadOne]);

  const removeAsset = async (id: number) => {
    await api({ action: "remove", asset_id: id }).catch(() => {});
    setAssets((a) => a.filter((x) => x.id !== id));
  };

  const setCaption = async (id: number, caption: string) => {
    setAssets((a) => a.map((x) => (x.id === id ? { ...x, caption } : x)));
    await api({ action: "caption", asset_id: id, caption }).catch(() => {});
  };

  // ---- render -----------------------------------------------------------
  if (loading) return <Shell><p style={{ color: C.dim }}>Loading…</p></Shell>;
  if (gone) return (
    <Shell>
      <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em",
                   margin: "0 0 8px" }}>This link isn&apos;t valid</h1>
      <p style={{ color: C.dim, lineHeight: 1.6 }}>
        It may have expired, or been replaced with a newer one. Drop us a message and we&apos;ll send a fresh link over.
      </p>
    </Shell>
  );

  const missing = REQUIRED.filter((id) => {
    const f = FIELDS[id];
    if (f?.type === "upload") return !assets.some((a) => a.role === f.upload!.role && a.status === "stored");
    const v = answers[id];
    return v === undefined || v === null || String(v).trim() === "";
  });

  if (submitted && step >= SECTIONS.length) return (
    <Shell>
      <div style={{ textAlign: "center", padding: "28px 0" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
        <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 27, lineHeight: 1.15,
                     letterSpacing: "-0.02em", margin: "0 0 10px" }}>
          Thanks — that&apos;s everything we need to get going.
        </h1>
        <p style={{ color: C.dim, lineHeight: 1.65 }}>
          We&apos;ll be in touch if anything&apos;s missing. If you think of more photos later,
          this link still works — just come back and add them.
        </p>
      </div>
    </Shell>
  );

  const section: Section = SECTIONS[Math.min(step, SECTIONS.length - 1)];
  const isLast = step === SECTIONS.length - 1;

  return (
    <Shell>
      <header style={{ marginBottom: 16 }}>
        <Eyebrow>{business || "Website onboarding"}</Eyebrow>
        <h1 style={{
          fontFamily: display, fontWeight: 800, fontSize: 29, lineHeight: 1.12,
          letterSpacing: "-0.02em", color: C.ink, margin: "9px 0 0",
        }}>{section.title}</h1>
        {section.intro && (
          <p style={{ color: C.dim, lineHeight: 1.65, margin: "11px 0 0", fontSize: 15 }}>{section.intro}</p>
        )}
      </header>

      <div style={{ margin: "20px 0 24px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {SECTIONS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 4, borderRadius: 3,
              background: i <= step ? C.accent : C.line,
              transition: "background .2s",
            }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 8, letterSpacing: "0.01em" }}>
          Step {step + 1} of {SECTIONS.length}
        </div>
      </div>

      {!online && (
        <Banner tone="warn">You&apos;ve gone offline — nothing is lost. We&apos;ll carry on as soon as you&apos;re back.</Banner>
      )}

      {section.fields.map((f) => (
        <FieldView
          key={f.id} field={f} answers={answers} assets={assets} progress={progress}
          onChange={setAnswer} onPick={onPick} onRemove={removeAsset} onCaption={setCaption}
        />
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 28,
                    paddingTop: 18, borderTop: `1px solid ${C.line}` }}>
        {step > 0 && (
          <button className="ob-btn ob-btn-ghost"
                  onClick={() => { save(); setStep(step - 1); window.scrollTo(0, 0); }}>
            Back
          </button>
        )}
        <div style={{ flex: 1, fontSize: 13, color: C.faint }}>
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
        </div>
        {!isLast ? (
          <button className="ob-btn ob-btn-primary"
                  onClick={() => { save(); setStep(step + 1); window.scrollTo(0, 0); }}>
            Next
          </button>
        ) : (
          <button
            onClick={async () => {
              await save();
              await fetch("/api/onboarding-public/submit", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              });
              setSubmitted(true); setStep(SECTIONS.length); window.scrollTo(0, 0);
            }}
            className="ob-btn ob-btn-primary"
          >
            {status === "open" ? "Send it over" : "Save changes"}
          </button>
        )}
      </div>

      {isLast && missing.length > 0 && (
        <p style={{ fontSize: 13, color: C.dim, marginTop: 14, lineHeight: 1.6 }}>
          {missing.length} thing{missing.length === 1 ? "" : "s"} still to fill in
          {" "}({missing.slice(0, 4).map((m) => FIELDS[m]?.label.toLowerCase()).join(", ")}
          {missing.length > 4 ? "…" : ""}). You can still send it over and add them later.
        </p>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- pieces ---

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Frame>
      <div style={{ marginBottom: 16 }}><Wordmark /></div>
      <Card>{children}</Card>
    </Frame>
  );
}

function Banner({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div style={{ background: tone === "warn" ? C.warnBg : "#fdecea", border: `1px solid ${C.line}`,
                  borderRadius: 10, padding: "10px 12px", fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

// Buttons and fields use the classes defined once in OnboardingBrand's <style>
// block: focus rings, hover and disabled states cannot be expressed inline.

function FieldView({ field, answers, assets, progress, onChange, onPick, onRemove, onCaption }: {
  field: Field; answers: Answers; assets: Asset[]; progress: Record<string, Progress>;
  onChange: (id: string, v: unknown) => void;
  onPick: (f: Field, files: FileList | null) => void;
  onRemove: (id: number) => void;
  onCaption: (id: number, c: string) => void;
}) {
  if (field.showIf) {
    const got = String(answers[field.showIf.field] ?? "");
    if (got !== field.showIf.equals) return null;
  }

  // A question asked once per line of another answer — nearby villages per town,
  // detail per service. This is what was hand-researched for every build.
  if (field.repeatOf) {
    const lines = String(answers[field.repeatOf] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    return (
      <>
        {lines.map((line, i) => (
          <Wrap key={i} label={field.label.replace("{{line}}", line)} help={i === 0 ? field.help : undefined}>
            <textarea className="ob-field"
              value={String((answers[`${field.id}__${i}`] as string) ?? "")}
              onChange={(e) => onChange(`${field.id}__${i}`, e.target.value)}
              rows={3} style={{ resize: "vertical" }}
            />
          </Wrap>
        ))}
      </>
    );
  }

  const v = answers[field.id];

  if (field.type === "upload") {
    const mine = assets.filter((a) => a.role === field.upload!.role);
    const inflight = Object.entries(progress).filter(([k]) => k.startsWith(field.id + ":"));
    return (
      <Wrap label={field.label} help={field.help} required={field.required}>
        <label className="ob-drop">
          <input
            type="file" multiple
            accept={field.upload!.accept === "video" ? "video/*"
                  : field.upload!.accept === "image" ? "image/*" : "image/*,application/pdf"}
            style={{ display: "none" }}
            onChange={(e) => { onPick(field, e.target.files); e.currentTarget.value = ""; }}
          />
          <div style={{ fontSize: 15.5, fontWeight: 600, color: C.accent, fontFamily: display }}>
            {field.upload!.accept === "video" ? "Choose a video" : "Choose files"}
          </div>
          <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>
            {field.upload!.min ? `at least ${field.upload!.min} · ` : ""}as many as you like, any size
          </div>
        </label>

        {inflight.map(([k, p]) => (
          <div key={k} style={{ marginTop: 10, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: p.error ? C.bad : C.dim }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span>{p.error ? "failed — tap to retry" : `${p.pct}%`}</span>
            </div>
            <div style={{ height: 3, background: C.line, borderRadius: 2, marginTop: 4 }}>
              <div style={{ height: 3, width: `${p.pct}%`, background: p.error ? C.bad : C.accent, borderRadius: 2 }} />
            </div>
          </div>
        ))}

        {mine.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {mine.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center",
                                       border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px" }}>
                <span style={{ color: a.status === "stored" ? C.good : C.faint, fontSize: 15 }}>
                  {a.status === "stored" ? "✓" : "…"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.original_name}
                  </div>
                  {field.upload!.captions && (
                    <input
                      defaultValue={a.caption} placeholder="What's in this photo?"
                      className="ob-field"
                      onBlur={(e) => onCaption(a.id, e.target.value)}
                      style={{ padding: "7px 9px", fontSize: 13, marginTop: 6 }}
                    />
                  )}
                </div>
                <button onClick={() => onRemove(a.id)} aria-label="Remove"
                        style={{ border: "none", background: "none", color: C.faint, cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </Wrap>
    );
  }

  if (field.type === "radio" || field.type === "checkboxes") {
    const multi = field.type === "checkboxes";
    const chosen: string[] = multi ? ((v as string[]) ?? []) : [];
    return (
      <Wrap label={field.label} help={field.help} required={field.required}>
        <div style={{ display: "grid", gap: 7 }}>
          {(field.options ?? []).map((opt) => {
            const on = multi ? chosen.includes(opt) : v === opt;
            return (
              <button key={opt} type="button"
                onClick={() => onChange(field.id, multi
                  ? (on ? chosen.filter((c) => c !== opt) : [...chosen, opt])
                  : opt)}
                style={{ textAlign: "left", padding: "11px 13px", fontSize: 15, cursor: "pointer",
                         borderRadius: 9, border: `1.5px solid ${on ? C.accent : C.line}`,
                         background: on ? B.accentWash : "#fff", color: C.ink, fontFamily: "inherit" }}>
                {opt}
              </button>
            );
          })}
        </div>
      </Wrap>
    );
  }

  const common = {
    className: "ob-field",
    value: String(v ?? ""),
    placeholder: field.placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field.id, e.target.value),
  };

  return (
    <Wrap label={field.label} help={field.help} required={field.required}>
      {field.type === "textarea" || field.type === "lines" || field.type === "hours" ? (
        <textarea {...common} rows={field.type === "lines" ? 5 : 4}
          placeholder={field.type === "lines" ? "One per line" : field.placeholder}
          style={{ resize: "vertical" }} />
      ) : (
        <input {...common}
          type={field.type === "number" ? "number" : field.type === "tel" ? "tel"
              : field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          inputMode={field.type === "tel" ? "tel" : field.type === "number" ? "numeric" : undefined} />
      )}
    </Wrap>
  );
}

function Wrap({ label, help, required, children }: {
  label: string; help?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 15, fontWeight: 600, marginBottom: help ? 3 : 7 }}>
        {label}{required && <span style={{ color: C.accent }}> *</span>}
      </label>
      {help && <p style={{ fontSize: 13.5, color: C.dim, margin: "0 0 8px", lineHeight: 1.5 }}>{help}</p>}
      {children}
    </div>
  );
}

/**
 * Retry with backoff. An expired presigned URL comes back from R2 as a 403
 * WITHOUT CORS headers, so the browser cannot read the status and reports it as
 * an opaque network error — indistinguishable from a dropped connection. That's
 * why every failure is retried rather than inspected.
 */
async function withRetry<T>(fn: () => Promise<T>, onFail?: () => void): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < MAX_TRIES; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e; onFail?.();
      if (i < MAX_TRIES - 1) await sleep(Math.min(16000, 1000 * 2 ** i) + Math.random() * 400);
    }
  }
  throw lastErr;
}
