"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project } from "@/types";

export default function LiveClients() {
  const [clients, setClients] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Project | null>(null);

  const fetchClients = useCallback(async () => {
    const res = await fetch("/api/projects?completed=true");
    const data = await res.json();
    setClients(data.projects || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const updateClient = useCallback(async (id: number, field: string, value: string | number) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "#555" }}>Loading clients...</div>;
  }

  const totalMRR = clients.reduce((sum, c) => sum + (c.monthly_fee || 0), 0);

  return (
    <div className="flex-1 flex flex-col">
      {/* Stats */}
      <div className="flex items-center gap-6 px-6 py-3" style={{ background: "#131313", borderBottom: "1px solid #2a2a2a" }}>
        <div>
          <span className="text-xs uppercase" style={{ color: "#666" }}>Live Clients</span>
          <span className="ml-2 text-lg font-bold" style={{ color: "#f0f0f0" }}>{clients.length}</span>
        </div>
        <div>
          <span className="text-xs uppercase" style={{ color: "#666" }}>Monthly Revenue</span>
          <span className="ml-2 text-lg font-bold" style={{ color: "#22c55e" }}>£{totalMRR.toFixed(2)}</span>
        </div>
      </div>

      {/* Client grid */}
      <div className="flex-1 overflow-auto p-4">
        {clients.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#444" }}>
            <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24" style={{ color: "#333" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-sm">No live clients yet</p>
            <p className="text-xs mt-1">Complete projects to see them here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <div
                key={client.id}
                className="rounded-xl p-4 cursor-pointer transition-all"
                style={{ background: "#161616", border: "1px solid #2a2a2a" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2a2a2a"}
                onClick={() => setSelectedClient(selectedClient?.id === client.id ? null : client)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: "#f0f0f0" }}>{client.business_name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "#666" }}>
                      {client.contact_name} {client.business_type ? `· ${client.business_type}` : ""}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#22c55e20" }}>
                    <svg className="w-4 h-4" fill="#22c55e" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                {client.domain && (
                  <p className="text-xs mt-2 truncate" style={{ color: "#ea580c" }}>{client.domain}</p>
                )}

                <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: "1px solid #2a2a2a" }}>
                  {client.monthly_fee > 0 ? (
                    <span className="text-sm font-bold" style={{ color: "#22c55e" }}>£{client.monthly_fee}/mo</span>
                  ) : (
                    <span className="text-xs" style={{ color: "#444" }}>No fee set</span>
                  )}
                  {client.renewal_date && (
                    <span className="text-xs" style={{ color: "#888" }}>
                      Renewal: {new Date(client.renewal_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>

                {/* Expanded details */}
                {selectedClient?.id === client.id && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid #2a2a2a" }}>
                    {[
                      { label: "Email", value: client.email },
                      { label: "Phone", value: client.phone },
                      { label: "Location", value: client.location },
                      { label: "Hosting", value: client.hosting_info },
                      { label: "Completed", value: client.completed_at ? new Date(client.completed_at).toLocaleDateString("en-GB") : "" },
                    ].filter((f) => f.value).map((f) => (
                      <div key={f.label} className="flex justify-between text-xs">
                        <span style={{ color: "#666" }}>{f.label}</span>
                        <span style={{ color: "#ccc" }}>{f.value}</span>
                      </div>
                    ))}
                    {/* Quick edit monthly fee */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs" style={{ color: "#666" }}>Monthly £</span>
                      <input className="flex-1 px-2 py-1 text-xs rounded"
                        style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0", outline: "none" }}
                        type="number" defaultValue={client.monthly_fee || ""}
                        onBlur={(e) => updateClient(client.id, "monthly_fee", Number(e.target.value))}
                        onKeyDown={(e) => { if (e.key === "Enter") updateClient(client.id, "monthly_fee", Number((e.target as HTMLInputElement).value)); }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
