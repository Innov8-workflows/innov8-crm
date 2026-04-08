"use client";

import { useEffect, useState, useCallback } from "react";
import type { Lead, EmailLog, Activity, LeadNote } from "@/types";

interface EmailLogPanelProps { lead: Lead; onClose: () => void; }

const ACTIVITY_TYPES = [
  { value: "call", label: "Called", icon: "📞" },
  { value: "whatsapp", label: "WhatsApp", icon: "💬" },
  { value: "facebook", label: "Facebook msg", icon: "📘" },
  { value: "meeting", label: "Meeting", icon: "🤝" },
  { value: "voicemail", label: "Voicemail", icon: "📱" },
  { value: "other", label: "Other", icon: "📝" },
];

export default function EmailLogPanel({ lead, onClose }: EmailLogPanelProps) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"timeline" | "notes">("timeline");
  const [newNote, setNewNote] = useState("");
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityType, setActivityType] = useState("call");
  const [activityDesc, setActivityDesc] = useState("");

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch(`/api/email-logs?lead_id=${lead.id}`).then((r) => r.json()),
      fetch(`/api/activities?lead_id=${lead.id}`).then((r) => r.json()),
      fetch(`/api/notes?lead_id=${lead.id}`).then((r) => r.json()),
    ]).then(([e, a, n]) => {
      setLogs(e.email_logs || []); setActivities(a.activities || []); setNotes(n.notes || []);
      setLoading(false);
    });
  }, [lead.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addActivity = async () => {
    if (!activityDesc.trim()) return;
    await fetch("/api/activities", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id, type: activityType, description: activityDesc }) });
    setActivityDesc(""); setShowActivityForm(false); fetchAll();
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id, content: newNote }) });
    setNewNote(""); fetchAll();
  };

  const timeline = [
    ...logs.map((l) => ({ id: `e-${l.id}`, icon: "✉️", title: l.subject || "(no subject)", detail: `To: ${l.recipient}`, date: l.sent_at })),
    ...activities.map((a) => {
      const t = ACTIVITY_TYPES.find((t) => t.value === a.type);
      return { id: `a-${a.id}`, icon: t?.icon || "📝", title: t?.label || a.type, detail: a.description, date: a.created_at };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] shadow-2xl z-50 flex flex-col"
      style={{ background: "#161616", borderLeft: "1px solid #2a2a2a" }}>
      <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid #2a2a2a" }}>
        <h2 className="text-lg font-semibold truncate" style={{ color: "#f0f0f0" }}>{lead.business_name}</h2>
        <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: "#666" }}
          onMouseEnter={(e) => e.currentTarget.style.color = "#f0f0f0"}
          onMouseLeave={(e) => e.currentTarget.style.color = "#666"}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-4" style={{ borderBottom: "1px solid #2a2a2a", background: "#131313" }}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[["Contact", lead.contact_name], ["Email", lead.email], ["Phone", lead.phone], ["Type", lead.business_type]].map(([l, v]) => (
            <div key={l}><span style={{ color: "#666" }}>{l}:</span> <span style={{ color: "#ccc" }}>{v || "—"}</span></div>
          ))}
          {lead.demo_site_url && (
            <div className="col-span-2"><span style={{ color: "#666" }}>Demo:</span>{" "}
              <a href={lead.demo_site_url} target="_blank" rel="noreferrer" style={{ color: "#ea580c" }} className="hover:underline text-xs">{lead.demo_site_url}</a>
            </div>
          )}
        </div>
      </div>

      <div className="flex" style={{ borderBottom: "1px solid #2a2a2a" }}>
        {(["timeline", "notes"] as const).map((s) => (
          <button key={s} onClick={() => setActiveSection(s)}
            className="flex-1 py-2 text-sm font-medium transition-colors"
            style={{
              color: activeSection === s ? "#ea580c" : "#666",
              borderBottom: activeSection === s ? "2px solid #ea580c" : "2px solid transparent",
            }}>
            {s === "timeline" ? "Timeline" : `Notes (${notes.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? <p className="text-sm" style={{ color: "#555" }}>Loading...</p> : activeSection === "timeline" ? (
          <>
            {!showActivityForm ? (
              <button className="w-full mb-3 px-3 py-2 text-sm rounded-lg flex items-center gap-2 transition-colors"
                style={{ color: "#ea580c", border: "1px solid rgba(234,88,12,0.2)", background: "rgba(234,88,12,0.05)" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(234,88,12,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(234,88,12,0.05)"}
                onClick={() => setShowActivityForm(true)}>
                + Log activity
              </button>
            ) : (
              <div className="mb-3 p-3 rounded-lg space-y-2" style={{ border: "1px solid rgba(234,88,12,0.2)", background: "rgba(234,88,12,0.05)" }}>
                <div className="flex gap-1 flex-wrap">
                  {ACTIVITY_TYPES.map((t) => (
                    <button key={t.value} className="px-2 py-1 text-xs rounded-full transition-colors"
                      style={{
                        background: activityType === t.value ? "#ea580c" : "#1e1e1e",
                        color: activityType === t.value ? "#fff" : "#888",
                        border: `1px solid ${activityType === t.value ? "#ea580c" : "#333"}`,
                      }}
                      onClick={() => setActivityType(t.value)}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <input autoFocus className="w-full px-2 py-1.5 text-sm rounded"
                  style={{ background: "#1e1e1e", border: "1px solid #333", color: "#f0f0f0", outline: "none" }}
                  placeholder="What happened?" value={activityDesc}
                  onChange={(e) => setActivityDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addActivity(); }} />
                <div className="flex gap-2">
                  <button onClick={addActivity} className="px-3 py-1 text-xs rounded font-medium" style={{ background: "#ea580c", color: "#fff" }}>Save</button>
                  <button onClick={() => setShowActivityForm(false)} className="px-3 py-1 text-xs" style={{ color: "#666" }}>Cancel</button>
                </div>
              </div>
            )}
            {timeline.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "#444" }}>No activity yet</p>
            ) : (
              <div className="space-y-1">
                {timeline.map((item) => (
                  <div key={item.id} className="flex gap-3 py-2" style={{ borderBottom: "1px solid #1e1e1e" }}>
                    <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: "#f0f0f0" }}>{item.title}</p>
                      {item.detail && <p className="text-xs truncate" style={{ color: "#666" }}>{item.detail}</p>}
                      <p className="text-xs mt-0.5" style={{ color: "#444" }}>{fmt(item.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <input className="flex-1 px-2 py-1.5 text-sm rounded"
                style={{ background: "#1e1e1e", border: "1px solid #333", color: "#f0f0f0", outline: "none" }}
                placeholder="Add a note..." value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
              <button onClick={addNote} className="px-3 py-1.5 text-xs rounded font-medium" style={{ background: "#ea580c", color: "#fff" }}>Add</button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "#444" }}>No notes yet</p>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="p-3 rounded-lg" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "#ddd" }}>{note.content}</p>
                    <p className="text-xs mt-1" style={{ color: "#555" }}>{fmt(note.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
