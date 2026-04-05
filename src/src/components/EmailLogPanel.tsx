"use client";

import { useEffect, useState } from "react";
import type { Lead, EmailLog } from "@/types";

interface EmailLogPanelProps {
  lead: Lead;
  onClose: () => void;
}

export default function EmailLogPanel({ lead, onClose }: EmailLogPanelProps) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/email-logs?lead_id=${lead.id}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.email_logs || []);
        setLoading(false);
      });
  }, [lead.id]);

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 truncate">{lead.business_name}</h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Contact:</span>
            <span className="ml-1 text-gray-900">{lead.contact_name || "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Email:</span>
            <span className="ml-1 text-gray-900">{lead.email || "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Phone:</span>
            <span className="ml-1 text-gray-900">{lead.phone || "—"}</span>
          </div>
          <div>
            <span className="text-gray-500">Type:</span>
            <span className="ml-1 text-gray-900">{lead.business_type || "—"}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Email History</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">No emails sent yet</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-sm font-medium text-gray-900">{log.subject || "(no subject)"}</p>
                <p className="text-xs text-gray-500 mt-1">
                  To: {log.recipient} &middot; {new Date(log.sent_at).toLocaleDateString("en-GB", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
