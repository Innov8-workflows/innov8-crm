"use client";

import { useEffect, useState, useCallback } from "react";
import type { Lead, EmailLog, Activity, LeadNote } from "@/types";

interface EmailLogPanelProps {
  lead: Lead;
  onClose: () => void;
}

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
    ]).then(([emailData, actData, noteData]) => {
      setLogs(emailData.email_logs || []);
      setActivities(actData.activities || []);
      setNotes(noteData.notes || []);
      setLoading(false);
    });
  }, [lead.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addActivity = async () => {
    if (!activityDesc.trim()) return;
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id, type: activityType, description: activityDesc }),
    });
    setActivityDesc("");
    setShowActivityForm(false);
    fetchAll();
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id, content: newNote }),
    });
    setNewNote("");
    fetchAll();
  };

  // Combine emails + activities into a unified timeline
  const timeline = [
    ...logs.map((l) => ({
      id: `email-${l.id}`,
      type: "email" as const,
      icon: "✉️",
      title: l.subject || "(no subject)",
      detail: `To: ${l.recipient}`,
      date: l.sent_at,
    })),
    ...activities.map((a) => {
      const typeInfo = ACTIVITY_TYPES.find((t) => t.value === a.type);
      return {
        id: `activity-${a.id}`,
        type: "activity" as const,
        icon: typeInfo?.icon || "📝",
        title: typeInfo?.label || a.type,
        detail: a.description,
        date: a.created_at,
      };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 truncate">{lead.business_name}</h2>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Lead summary */}
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-500">Contact:</span> <span className="text-gray-900">{lead.contact_name || "—"}</span></div>
          <div><span className="text-gray-500">Email:</span> <span className="text-gray-900">{lead.email || "—"}</span></div>
          <div><span className="text-gray-500">Phone:</span> <span className="text-gray-900">{lead.phone || "—"}</span></div>
          <div><span className="text-gray-500">Type:</span> <span className="text-gray-900">{lead.business_type || "—"}</span></div>
          {lead.demo_site_url && (
            <div className="col-span-2">
              <span className="text-gray-500">Demo site:</span>{" "}
              <a href={lead.demo_site_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">
                {lead.demo_site_url}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-gray-200">
        <button
          className={`flex-1 py-2 text-sm font-medium ${activeSection === "timeline" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveSection("timeline")}
        >
          Timeline
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium ${activeSection === "notes" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500"}`}
          onClick={() => setActiveSection("notes")}
        >
          Notes ({notes.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : activeSection === "timeline" ? (
          <>
            {/* Add activity button */}
            {!showActivityForm ? (
              <button
                className="w-full mb-3 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-2"
                onClick={() => setShowActivityForm(true)}
              >
                <span className="text-lg">+</span> Log activity
              </button>
            ) : (
              <div className="mb-3 p-3 border border-blue-200 rounded-lg bg-blue-50/50 space-y-2">
                <div className="flex gap-1 flex-wrap">
                  {ACTIVITY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      className={`px-2 py-1 text-xs rounded-full ${activityType === t.value ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}
                      onClick={() => setActivityType(t.value)}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  placeholder="What happened?"
                  value={activityDesc}
                  onChange={(e) => setActivityDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addActivity(); }}
                />
                <div className="flex gap-2">
                  <button onClick={addActivity} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                  <button onClick={() => setShowActivityForm(false)} className="px-3 py-1 text-xs text-gray-500">Cancel</button>
                </div>
              </div>
            )}

            {/* Timeline */}
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
            ) : (
              <div className="space-y-1">
                {timeline.map((item) => (
                  <div key={item.id} className="flex gap-3 py-2 border-b border-gray-50">
                    <span className="text-base flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      {item.detail && <p className="text-xs text-gray-500 truncate">{item.detail}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Add note */}
            <div className="mb-3 flex gap-2">
              <input
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
              />
              <button
                onClick={addNote}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>

            {notes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No notes yet</p>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatDate(note.created_at)}</p>
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
