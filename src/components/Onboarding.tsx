"use client";

import { useCallback, useEffect, useState } from "react";
import { formFor } from "@/lib/onboardingSchema";
import Icon from "./Icon";

// The Onboarding view: every submission, what each one is still missing, and the
// media that came with it.
//
// Shaped after ClientDashboard — rail on the left, detail on the right — because
// it's the same job: pick a client, see their month. Styling follows the house
// pattern of inline styles over CSS variables so the seven themes keep working,
// and client names carry .cf-name so the Content Filter blurs them.
//
// Unassigned submissions (from the shared link) sort to the top of the rail:
// they are the ones needing an action from Jay.

interface Row {
  id: number; project_id: number | null; token: string; status: string; kind: string;
  business_name: string; label: string; expires_at: string; submitted_at: string;
  asset_count: number; stored: number; failed: number; created_at: string; archived: number;
  seen_at: string; notified_at: string;
  queued_at: string; build_folder: string; build_started_at: string; build_result: string;
}
interface Asset {
  id: number; role: string; pair_id: string; original_name: string; caption: string;
  content_type: string; actual_size: number; status: string; url: string | null;
}
interface Detail {
  submission: Row & { r2_prefix: string };
  answers: Record<string, unknown>;
  assets: Asset[];
  missing: { id: string; label: string }[];
  confirm: { id: string; label: string; value: string }[];
}
interface ProjectOpt { id: number; business_name: string; stage: string }

const chip = (status: string): { bg: string; fg: string; text: string } => {
  switch (status) {
    case "open": return { bg: "var(--surface3)", fg: "var(--text-secondary)", text: "In progress" };
    case "submitted": return { bg: "rgba(234,88,12,0.15)", fg: "var(--accent)", text: "Submitted" };
    case "accepted": return { bg: "rgba(18,136,90,0.15)", fg: "#12885a", text: "Accepted" };
    case "built": return { bg: "rgba(18,136,90,0.15)", fg: "#12885a", text: "Built" };
    case "revoked": return { bg: "var(--surface3)", fg: "var(--text-dim)", text: "Revoked" };
    default: return { bg: "var(--surface3)", fg: "var(--text-secondary)", text: status };
  }
};

const bytes = (n: number) =>
  n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB`
  : n >= 1048576 ? `${Math.round(n / 1048576)} MB`
  : `${Math.max(1, Math.round(n / 1024))} KB`;

export default function Onboarding({ active, onSeen }: { active: boolean; onSeen?: (n: number) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pin, setPin] = useState("");
  const [folder, setFolder] = useState("");
  const [note, setNote] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const loadRows = useCallback(async () => {
    const d = await (await fetch(`/api/onboarding/submissions${showArchived ? "?archived=1" : ""}`)).json();
    const list = (d.submissions || []) as Row[];
    setRows(list);
    // Keep the tab badge honest without another round trip: opening a submission
    // marks it seen server-side, so the count changes as Jay reads.
    onSeen?.(list.filter((r) => !r.seen_at && !r.archived
      && r.status !== "open" && r.status !== "revoked").length);
    return list;
  }, [showArchived]);

  const loadDetail = useCallback(async (id: number) => {
    const d = await (await fetch(`/api/onboarding/submissions/${id}`)).json();
    setDetail(d.error ? null : d);
  }, []);

  useEffect(() => {
    if (!active) return;
    loadRows().then((list) => { if (list?.length && selected === null) setSelected(list[0].id); });
    fetch("/api/projects?completed=false").then((r) => r.json()).then((d) => {
      const list = (d.projects || d || []) as ProjectOpt[];
      setProjects(list);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);
  useEffect(() => {
    setFolder(detail?.submission.build_folder || "");
    setNote("");
    setConfirmDelete(false);
    setPin("");
  }, [detail?.submission.id, detail?.submission.build_folder]);
  useEffect(() => { if (active) loadRows(); }, [showArchived, active, loadRows]);

  const act = async (id: number, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    await fetch("/api/onboarding/submissions", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...extra }),
    });
    await loadRows(); await loadDetail(id);
    setBusy(false);
  };

  const mint = async (projectId: number) => {
    setBusy(true);
    const r = await (await fetch("/api/onboarding/submissions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    })).json();
    const list = await loadRows();
    if (r.id) setSelected(r.id);
    setBusy(false);
    return list;
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(""), 1600);
    }).catch(() => {});
  };

  const sharedLink = `${origin}/onboarding/start`;

  /**
   * A paste-able instruction for a Claude Code session.
   *
   * NOT the client's link — that renders a form and returns HTML, so pasting it
   * at Claude Code gets markup, not answers. And a client-held token can never
   * hand out bulk file access by design. This gives the session the two things
   * it actually needs: which submission, and where the folder is.
   */
  const buildPrompt = (d: Detail) => {
    const name = d.submission.business_name || "this client";
    const folder = d.submission.build_folder;
    return [
      `Run /site-buildout for onboarding submission ${d.submission.id} — ${name}.`,
      "",
      folder
        ? `Work in: ${folder}\nEverything is already downloaded to _source/ in that folder (answers.json, site.config.draft.js and the media). Read BUILD-BRIEF.md first.`
        : `Pull it down first using the innov8-onboarding connector: get_submission for id ${d.submission.id}, then fetch_assets into the client's existing demo folder.`,
      "",
      "Do not restructure the demo homepage and do not re-encode or replace any existing video — that demo is what converted the customer. Stop before deploying.",
    ].join("\n");
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* ── rail ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-shrink-0 overflow-y-auto"
           style={{ width: 260, borderRight: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="text-xs font-bold mb-2" style={{ color: "var(--text-muted)" }}>SHARED LINK</div>
          <button
            onClick={() => copy(sharedLink, "shared")}
            className="w-full text-left px-2 py-2 rounded-lg text-xs"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}
            title={sharedLink}
          >
            {copied === "shared" ? "Copied" : "Copy link for anyone"}
          </button>
          <div className="text-xs mt-2" style={{ color: "var(--text-dim)", lineHeight: 1.45 }}>
            For a business not in the CRM yet. Attach it to a project once it arrives.
          </div>
        </div>

        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="text-xs font-bold mb-2" style={{ color: "var(--text-muted)" }}>NEW LINK FOR A CLIENT</div>
          <select
            className="w-full px-2 py-2 rounded-lg text-xs"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}
            value=""
            disabled={busy}
            onChange={(e) => { if (e.target.value) mint(Number(e.target.value)); e.target.value = ""; }}
          >
            <option value="">Choose a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.business_name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowArchived(!showArchived)}
          className="px-3 py-2 text-left text-xs"
          style={{ borderBottom: "1px solid var(--border)", color: "var(--text-dim)", background: "transparent" }}
        >
          {showArchived ? "\u2713 Showing archived" : "Show archived"}
        </button>

        {rows.length === 0 && (
          <div className="px-3 py-6 text-xs" style={{ color: "var(--text-dim)", lineHeight: 1.6 }}>
            No submissions yet. Mint a link above, or send someone the shared link.
          </div>
        )}
        {rows.map((r) => {
          const c = chip(r.status);
          const isSel = selected === r.id;
          return (
            <button key={r.id} onClick={() => setSelected(r.id)}
              className="text-left px-3 py-2.5"
              style={{
                background: isSel ? "var(--accent-subtle)" : "transparent",
                borderBottom: "1px solid var(--border)",
                boxShadow: isSel ? "inset 3px 0 0 var(--accent)" : "none",
              }}>
              <div className="flex items-center justify-between gap-2">
                {!r.seen_at && r.status !== "open" && (
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--accent)",
                                 flexShrink: 0 }} />
                )}
                <span className="text-sm font-bold truncate cf-name"
                      style={{ color: "var(--text)", opacity: r.archived ? 0.5 : 1 }}>
                  {r.business_name || "Unnamed"}
                </span>
                {r.queued_at && !r.build_started_at && (
                  <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: "rgba(234,88,12,0.15)", color: "var(--accent)" }}>queued</span>
                )}
                {r.build_started_at && (
                  <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: "rgba(18,136,90,0.15)", color: "#12885a" }}>building</span>
                )}
                {r.project_id === null && (
                  <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: "rgba(234,88,12,0.15)", color: "var(--accent)" }}>new</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>{c.text}</span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {r.stored} file{r.stored === 1 ? "" : "s"}{r.failed > 0 ? ` · ${r.failed} failed` : ""}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── detail ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5">
        {!detail ? (
          <div className="text-sm" style={{ color: "var(--text-dim)" }}>Select a submission.</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold cf-name" style={{ color: "var(--text)" }}>
                  {detail.submission.business_name || "Unnamed"}
                </h2>
                <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                  Started {String(detail.submission.created_at).slice(0, 10)}
                  {detail.submission.submitted_at ? ` · sent ${String(detail.submission.submitted_at).slice(0, 10)}` : ""}
                  {` · link expires ${String(detail.submission.expires_at).slice(0, 10)}`}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => copy(`${origin}/onboarding/${detail.submission.token}`, "link")}
                  title="The client's own form link — send them this so they can come back and add more"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                  {copied === "link" ? "Copied" : "Copy their link"}
                </button>
                <button onClick={() => window.open(`/onboarding-print/${detail.submission.id}`, "_blank")}
                  title="Opens a clean printable version — choose Save as PDF in the print dialog"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                  Export PDF
                </button>
                <button onClick={() => copy(buildPrompt(detail), "prompt")}
                  title="Paste this into a Claude Code session to build the full site"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                  {copied === "prompt" ? "Copied" : "Copy build prompt"}
                </button>
                {detail.submission.status !== "accepted" && (
                  <button disabled={busy} onClick={() => act(detail.submission.id, "accept")}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }}>
                    Mark accepted
                  </button>
                )}
                <button disabled={busy} onClick={() => act(detail.submission.id, "extend")}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                  Extend
                </button>
                <button disabled={busy}
                  onClick={async () => {
                    const archiving = !detail.submission.archived;
                    await act(detail.submission.id, archiving ? "archive" : "unarchive");
                    // An archived row leaves the default list, so don't leave the
                    // pane showing a submission the rail no longer has.
                    if (archiving && !showArchived) { setSelected(null); setDetail(null); }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                  {detail.submission.archived ? "Unarchive" : "Archive"}
                </button>
                {detail.submission.archived === 1 && (
                  <button
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                    Delete
                  </button>
                )}
                {detail.submission.archived === 1 && confirmDelete && (
                  <span className="flex items-center gap-2">
                    <input
                      type="password" inputMode="numeric" value={pin} autoFocus
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="PIN"
                      className="px-2 py-1.5 rounded-lg text-xs"
                      style={{ width: 78, background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}
                    />
                    <button
                      disabled={busy || pin.length < 4}
                      onClick={async () => {
                        setBusy(true);
                        const r = await fetch(`/api/onboarding/submissions/${detail.submission.id}`, {
                          method: "DELETE", headers: { "x-delete-pin": pin },
                        });
                        const d = await r.json().catch(() => ({}));
                        setBusy(false);
                        if (!r.ok) { alert(d.error || "Couldn't delete that."); setPin(""); return; }
                        setSelected(null); setDetail(null); setConfirmDelete(false); setPin("");
                        await loadRows();
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{
                        background: pin.length < 4 ? "var(--surface3)" : "#c8321f",
                        border: "1px solid " + (pin.length < 4 ? "var(--border-light)" : "#c8321f"),
                        color: pin.length < 4 ? "var(--text-dim)" : "#fff",
                      }}>
                      Delete forever
                    </button>
                    <button onClick={() => { setConfirmDelete(false); setPin(""); }}
                      className="text-xs" style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}>
                      cancel
                    </button>
                  </span>
                )}
                {detail.submission.status !== "revoked" && (
                  <button disabled={busy} onClick={() => act(detail.submission.id, "revoke")}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                    Revoke
                  </button>
                )}
              </div>
            </div>

            {/* Unassigned → attach it to a project. */}
            {detail.submission.project_id === null && (
              <div className="mt-4 p-3 rounded-lg flex items-center gap-3 flex-wrap"
                   style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}>
                <Icon name="user-plus" className="w-4 h-4" />
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                  Came in through the shared link — not attached to a project yet.
                </span>
                <select
                  className="px-2 py-1.5 rounded-lg text-xs ml-auto"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}
                  value="" disabled={busy}
                  onChange={(e) => { if (e.target.value) act(detail.submission.id, "assign", { project_id: Number(e.target.value) }); }}
                >
                  <option value="">Attach to…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.business_name}</option>)}
                </select>
              </div>
            )}

            {/* Still outstanding — so chasing is specific, not "did you do it?" */}
            {detail.missing.length > 0 && (
              <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
                <div className="text-xs font-bold mb-1.5" style={{ color: "var(--accent)" }}>
                  STILL MISSING ({detail.missing.length})
                </div>
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {detail.missing.map((m) => m.label).join(" · ")}
                </div>
              </div>
            )}

            {/* Evidence, never auto-promoted to a claim. */}
            {detail.confirm.length > 0 && (
              <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
                <div className="text-xs font-bold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  CONFIRM BEFORE IT GOES ON THE SITE
                </div>
                {detail.confirm.map((c) => (
                  <div key={c.id} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-dim)" }}>{c.label}:</span> {c.value}
                  </div>
                ))}
                <div className="text-xs mt-1.5" style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>
                  These are the client&apos;s own words. Nothing here goes on the site until you&apos;ve seen the certificate.
                </div>
              </div>
            )}

            {detail.submission.submitted_at && !detail.submission.notified_at && (
              <div className="mt-3 p-2.5 rounded-lg text-xs"
                   style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                No alert email went out for this one — check Resend is configured in Vercel.
              </div>
            )}

            {/* Hand it to the build runner. */}
            <div className="mt-4 p-3 rounded-lg"
                 style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
              <div className="text-xs font-bold mb-2" style={{ color: "var(--text-muted)" }}>
                BUILD OUT THE FULL SITE
              </div>
              {detail.submission.build_started_at ? (
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Running since {detail.submission.build_started_at.slice(0, 16)} in{" "}
                  <span style={{ color: "var(--text-dim)" }}>{detail.submission.build_folder}</span>
                </div>
              ) : detail.submission.queued_at ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm" style={{ color: "var(--accent)" }}>
                    Queued, waiting for the runner on your machine.
                  </span>
                  <button disabled={busy} onClick={() => act(detail.submission.id, "unqueue")}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--surface3)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}>
                    Cancel
                  </button>
                  <div className="w-full text-xs mt-1" style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>
                    Picked up automatically if the runner is scheduled. Otherwise run{" "}
                    <code style={{ color: "var(--text-muted)" }}>node ~/.claude/mcp/onboarding/run-queue.mjs</code>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    value={folder} onChange={(e) => setFolder(e.target.value)}
                    placeholder="Path to their demo folder, e.g. C:\\Users\\Jay\\Projects\\coburn-roofing"
                    className="w-full px-2 py-2 rounded-lg text-xs mb-2"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}
                  />
                  <input
                    value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything the build should know (optional)"
                    className="w-full px-2 py-2 rounded-lg text-xs mb-2"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}
                  />
                  <button
                    disabled={busy || folder.trim().length < 3}
                    onClick={() => act(detail.submission.id, "queue", { folder, note })}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{
                      background: folder.trim().length < 3 ? "var(--surface3)" : "var(--accent)",
                      border: "1px solid var(--border-light)",
                      color: folder.trim().length < 3 ? "var(--text-dim)" : "#fff",
                    }}>
                    Queue for build
                  </button>
                  <div className="text-xs mt-2" style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>
                    Runs inside their existing demo folder so the theme, build script and videos
                    stay as they are. Stops before deploying.
                  </div>
                </>
              )}
              {detail.submission.build_result && (
                <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                  Last run: {detail.submission.build_result}
                </div>
              )}
            </div>

            {/* Media, grouped the way the build consumes it. */}
            {detail.assets.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-bold mb-2" style={{ color: "var(--text-muted)" }}>
                  FILES ({detail.assets.filter((a) => a.status === "stored").length})
                </div>
                {Object.entries(
                  detail.assets.reduce((acc, a) => {
                    (acc[a.role] ||= []).push(a); return acc;
                  }, {} as Record<string, Asset[]>),
                ).map(([role, list]) => (
                  <div key={role} className="mb-4">
                    <div className="text-xs mb-1.5" style={{ color: "var(--text-dim)" }}>
                      {role.replace(/_/g, " ")} — {list.length}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {list.map((a) => (
                        <a key={a.id} href={a.url || undefined} target="_blank" rel="noreferrer"
                           className="rounded-lg overflow-hidden block"
                           style={{ width: 108, border: "1px solid var(--border-light)", background: "var(--surface2)" }}
                           title={`${a.original_name}${a.caption ? " — " + a.caption : ""}`}>
                          {a.url && a.content_type.startsWith("image/") ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={a.url} alt={a.caption || a.original_name}
                                 style={{ width: "100%", height: 76, objectFit: "cover", display: "block" }} />
                          ) : (
                            <div style={{ height: 76, display: "flex", alignItems: "center", justifyContent: "center",
                                          color: "var(--text-dim)", fontSize: 11 }}>
                              {a.content_type.startsWith("video/") ? "video" : "file"}
                            </div>
                          )}
                          <div className="px-1.5 py-1 text-xs truncate" style={{ color: "var(--text-dim)" }}>
                            {bytes(a.actual_size || 0)}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* The answers, in the order the form asks them. */}
            <div className="mt-5">
              <div className="text-xs font-bold mb-2" style={{ color: "var(--text-muted)" }}>ANSWERS</div>
              {formFor(detail.submission.kind).sections.map((s) => {
                const filled = s.fields.filter((f) => {
                  const v = detail.answers[f.id];
                  return f.type !== "upload" && v !== undefined && String(v).trim() !== "";
                });
                const repeats = Object.keys(detail.answers).filter((k) => k.includes("__") &&
                  s.fields.some((f) => k.startsWith(f.id + "__")));
                if (!filled.length && !repeats.length) return null;
                return (
                  <div key={s.id} className="mb-4">
                    <div className="text-xs mb-1.5" style={{ color: "var(--text-dim)" }}>{s.title}</div>
                    <div className="rounded-lg" style={{ border: "1px solid var(--border-light)" }}>
                      {filled.map((f, i) => (
                        <div key={f.id} className="px-3 py-2"
                             style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                          <div className="text-xs" style={{ color: "var(--text-dim)" }}>{f.label}</div>
                          <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                            {Array.isArray(detail.answers[f.id])
                              ? (detail.answers[f.id] as string[]).join(", ")
                              : String(detail.answers[f.id])}
                          </div>
                        </div>
                      ))}
                      {repeats.map((k) => (
                        <div key={k} className="px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
                          <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                            {formFor(detail.submission.kind).fields[k.split("__")[0]]?.label.replace("{{line}}", `#${Number(k.split("__")[1]) + 1}`) || k}
                          </div>
                          <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                            {String(detail.answers[k])}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
