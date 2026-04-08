"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Project } from "@/types";
import ProjectDetailModal from "./ProjectDetailModal";
import LoadingAI from "./LoadingAI";

interface ClientStats {
  mrr: number;
  capex: number;
  clientCount: number;
  overdueRenewals: number;
  lostClients: number;
}

type SortKey = "business_name" | "contact_name" | "business_type" | "location" | "monthly_fee" | "renewal_date" | "domain" | "completed_at";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "card";
type ClientFilter = "active" | "lost";

export default function LiveClients({ ownerFilter = "" }: { ownerFilter?: string }) {
  const [clients, setClients] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("active");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("business_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [invoicing, setInvoicing] = useState<number | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  const fetchClients = useCallback(async () => {
    const ownerParam = ownerFilter ? `&owner=${encodeURIComponent(ownerFilter)}` : "";
    const res = await fetch(`/api/projects?completed=true&client_status=${clientFilter}${ownerParam}`);
    const data = await res.json();
    setClients(data.projects || []);
    setLoading(false);
  }, [clientFilter, ownerFilter]);

  const fetchStats = useCallback(async () => {
    const ownerParam = ownerFilter ? `?owner=${encodeURIComponent(ownerFilter)}` : "";
    const res = await fetch(`/api/clients/stats${ownerParam}`);
    setStats(await res.json());
  }, [ownerFilter]);

  useEffect(() => { fetchClients(); fetchStats(); }, [clientFilter, ownerFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateClient = useCallback(async (id: number, field: string, value: string | number) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetchStats();
  }, [fetchStats]);

  const markAsLost = useCallback(async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_status: "lost" }),
    });
    setClients((prev) => prev.filter((c) => c.id !== id));
    fetchStats();
  }, [fetchStats]);

  const reactivateClient = useCallback(async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_status: "active" }),
    });
    setClients((prev) => prev.filter((c) => c.id !== id));
    fetchStats();
  }, [fetchStats]);

  const cycleStatus = useCallback(async (id: number, currentStatus: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Cycle: active → refine → active (lost is handled by the Lost button)
    const nextStatus = currentStatus === "active" || !currentStatus ? "refine" : "active";
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, client_status: nextStatus } : c)));
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_status: nextStatus }),
    });
  }, []);

  const toggleInvoiceStatus = useCallback(async (id: number, currentStatus: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = currentStatus === "invoiced" ? "to_invoice" : "invoiced";
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, invoice_status: next } : c)));
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_status: next }),
    });
  }, []);

  const sendInvoice = useCallback(async (projectId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setInvoicing(projectId);
    setInvoiceResult(null);
    try {
      const res = await fetch("/api/invoices/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (data.ok) {
        setInvoiceResult({ id: projectId, msg: `Invoice sent to ${data.customer} for £${data.amount}`, ok: true });
      } else {
        setInvoiceResult({ id: projectId, msg: data.error || "Failed to send invoice", ok: false });
      }
    } catch {
      setInvoiceResult({ id: projectId, msg: "Network error", ok: false });
    }
    setInvoicing(null);
  }, []);

  const deleteClient = useCallback(async (id: number) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setClients((prev) => prev.filter((c) => c.id !== id));
    setConfirmDelete(null);
    fetchStats();
  }, [fetchStats]);

  const filtered = useMemo(() => {
    let list = clients;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        (c.business_name || "").toLowerCase().includes(q) ||
        (c.contact_name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.domain || "").toLowerCase().includes(q) ||
        (c.location || "").toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  }, [clients, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const startEdit = (id: number, field: string, currentValue: string | number) => {
    setEditingCell({ id, field });
    setEditValue(String(currentValue || ""));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const val = editingCell.field === "monthly_fee" ? Number(editValue) : editValue;
    updateClient(editingCell.id, editingCell.field, val);
    setEditingCell(null);
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    return new Date(d + (d.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  const isOverdue = (d: string) => {
    if (!d) return false;
    return new Date(d + "T00:00:00") < new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
  };

  const isLostView = clientFilter === "lost";

  if (loading) {
    return <LoadingAI message="Loading clients" />;
  }

  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      {/* Dashboard Stats */}
      <div style={{ background: "#131313", borderBottom: "1px solid #2a2a2a" }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 px-4 py-3">
          {[
            { label: "Live Clients", value: stats?.clientCount ?? clients.length, color: "#f0f0f0", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
            { label: "Monthly Revenue", value: `£${(stats?.mrr ?? 0).toFixed(2)}`, color: "#22c55e", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
            { label: "Total CAPEX", value: `£${(stats?.capex ?? 0).toFixed(2)}`, color: "#ea580c", icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
            { label: "Overdue Renewals", value: stats?.overdueRenewals ?? 0, color: stats?.overdueRenewals ? "#ef4444" : "#666", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
            { label: "Lost Clients", value: stats?.lostClients ?? 0, color: stats?.lostClients ? "#ef4444" : "#666", icon: "M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" },
          ].map((card) => (
            <div key={card.label} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${card.color}15` }}>
                <svg className="w-5 h-5" fill="none" stroke={card.color} strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </div>
              <div>
                <div className="text-xl font-bold" style={{ color: card.color }}>{card.value}</div>
                <div className="text-xs" style={{ color: "#666" }}>{card.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar: Search + Filter + View Toggle */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#131313", borderBottom: "1px solid #2a2a2a" }}>
        <div className="relative flex-1" style={{ maxWidth: 320 }}>
          <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="#666" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md"
            style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0", outline: "none" }}
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Active / Lost toggle */}
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid #2a2a2a" }}>
          <button
            className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors"
            style={{ background: !isLostView ? "#22c55e" : "#1e1e1e", color: !isLostView ? "#fff" : "#888" }}
            onClick={() => setClientFilter("active")}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
            Active
          </button>
          <button
            className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors"
            style={{ background: isLostView ? "#ef4444" : "#1e1e1e", color: isLostView ? "#fff" : "#888" }}
            onClick={() => setClientFilter("lost")}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Lost{stats?.lostClients ? ` (${stats.lostClients})` : ""}
          </button>
        </div>

        {/* Grid / Card toggle */}
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid #2a2a2a" }}>
          {(["grid", "card"] as const).map((mode) => (
            <button
              key={mode}
              className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors"
              style={{
                background: viewMode === mode ? "#ea580c" : "#1e1e1e",
                color: viewMode === mode ? "#fff" : "#888",
              }}
              onClick={() => setViewMode(mode)}
            >
              {mode === "grid" ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              )}
              {mode === "grid" ? "Grid" : "Cards"}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: "#666" }}>{filtered.length} client{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {clients.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#444" }}>
            <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24" style={{ color: "#333" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d={isLostView
                ? "M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"
                : "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              } />
            </svg>
            <p className="text-sm">{isLostView ? "No lost clients" : "No live clients yet"}</p>
            <p className="text-xs mt-1">{isLostView ? "Clients you mark as lost will appear here" : "Complete projects to see them here"}</p>
          </div>
        ) : viewMode === "grid" ? (
          <GridView
            clients={filtered}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            editingCell={editingCell}
            editValue={editValue}
            onStartEdit={startEdit}
            onEditChange={setEditValue}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditingCell(null)}
            formatDate={formatDate}
            isOverdue={isOverdue}
            onOpenProject={setSelectedProject}
            isLostView={isLostView}
            onMarkLost={markAsLost}
            onReactivate={reactivateClient}
            onDelete={setConfirmDelete}
            onCycleStatus={cycleStatus}
            onSendInvoice={sendInvoice}
            invoicing={invoicing}
          />
        ) : (
          <CardView
            clients={filtered}
            formatDate={formatDate}
            isOverdue={isOverdue}
            onOpenProject={setSelectedProject}
            isLostView={isLostView}
            onMarkLost={markAsLost}
            onReactivate={reactivateClient}
            onDelete={setConfirmDelete}
            onCycleStatus={cycleStatus}
            onSendInvoice={sendInvoice}
            invoicing={invoicing}
            onToggleInvoiceStatus={toggleInvoiceStatus}
          />
        )}
      </div>

      {/* Project Detail Modal */}
      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onUpdate={() => { fetchClients(); fetchStats(); }}
          onComplete={() => {}}
          onMarkLost={(id) => { markAsLost(id); setSelectedProject(null); }}
          onReactivate={(id) => { reactivateClient(id); setSelectedProject(null); }}
          isLostView={isLostView}
        />
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setConfirmDelete(null)}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#ef444420" }}>
                <svg className="w-5 h-5" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "#f0f0f0" }}>Delete Client Permanently</h3>
                <p className="text-xs mt-0.5" style={{ color: "#888" }}>
                  {clients.find((c) => c.id === confirmDelete)?.business_name}
                </p>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: "#888" }}>
              This will permanently delete the project, all files, tasks, and the original lead with all its notes, activities and email logs. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1.5 text-sm rounded-md" style={{ background: "#252525", color: "#ccc" }}
                onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="px-3 py-1.5 text-sm font-semibold rounded-md" style={{ background: "#ef4444", color: "#fff" }}
                onClick={() => deleteClient(confirmDelete)}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice result toast */}
      {invoiceResult && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 max-w-sm"
          style={{ background: invoiceResult.ok ? "#052e16" : "#450a0a", border: `1px solid ${invoiceResult.ok ? "#22c55e40" : "#ef444440"}` }}>
          <span className="text-sm" style={{ color: invoiceResult.ok ? "#22c55e" : "#ef4444" }}>{invoiceResult.msg}</span>
          <button className="text-xs px-2 py-0.5 rounded" style={{ color: "#888" }}
            onClick={() => setInvoiceResult(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

/* ─── Grid View ──────────────────────────────────────────────────── */

interface GridProps {
  clients: Project[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  editingCell: { id: number; field: string } | null;
  editValue: string;
  onStartEdit: (id: number, field: string, value: string | number) => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  formatDate: (d: string) => string;
  isOverdue: (d: string) => boolean;
  onOpenProject: (p: Project) => void;
  isLostView: boolean;
  onMarkLost: (id: number, e?: React.MouseEvent) => void;
  onReactivate: (id: number, e?: React.MouseEvent) => void;
  onDelete: (id: number) => void;
  onCycleStatus: (id: number, currentStatus: string, e?: React.MouseEvent) => void;
  onSendInvoice: (id: number, e?: React.MouseEvent) => void;
  invoicing: number | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "LIVE", color: "#22c55e", bg: "#22c55e20" },
  refine: { label: "REFINE", color: "#eab308", bg: "#eab30820" },
  lost: { label: "LOST", color: "#ef4444", bg: "#ef444420" },
};

const GRID_COLUMNS: { key: SortKey; label: string; width: string; editable?: boolean; type?: string }[] = [
  { key: "business_name", label: "Business", width: "minmax(160px, 1.5fr)" },
  { key: "contact_name", label: "Contact", width: "minmax(120px, 1fr)" },
  { key: "business_type", label: "Type", width: "minmax(100px, 0.8fr)" },
  { key: "location", label: "Location", width: "minmax(120px, 1fr)" },
  { key: "domain", label: "Domain", width: "minmax(140px, 1.2fr)", editable: true },
  { key: "monthly_fee", label: "Monthly Fee", width: "minmax(100px, 0.7fr)", editable: true, type: "number" },
  { key: "renewal_date", label: "Renewal", width: "minmax(120px, 0.8fr)", editable: true, type: "date" },
  { key: "completed_at", label: "Completed", width: "minmax(110px, 0.7fr)" },
];

function GridView({ clients, sortKey, sortDir, onSort, editingCell, editValue, onStartEdit, onEditChange, onCommitEdit, onCancelEdit, formatDate, isOverdue, onOpenProject, isLostView, onMarkLost, onReactivate, onDelete, onCycleStatus, onSendInvoice, invoicing }: GridProps) {
  const gridTemplate = `40px 70px ${GRID_COLUMNS.map((c) => c.width).join(" ")} 100px`;

  return (
    <div style={{ minWidth: 900 }}>
      {/* Header */}
      <div className="grid items-center px-2 py-1.5 sticky top-0 z-10" style={{ gridTemplateColumns: gridTemplate, background: "#161616", borderBottom: "1px solid #2a2a2a" }}>
        <div />
        <span className="text-xs font-medium px-2" style={{ color: "#888" }}>Status</span>
        {GRID_COLUMNS.map((col) => (
          <button
            key={col.key}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors text-left"
            style={{ color: sortKey === col.key ? "#ea580c" : "#888" }}
            onClick={() => onSort(col.key)}
            onMouseEnter={(e) => e.currentTarget.style.color = "#f0f0f0"}
            onMouseLeave={(e) => e.currentTarget.style.color = sortKey === col.key ? "#ea580c" : "#888"}
          >
            {col.label}
            {sortKey === col.key && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
              </svg>
            )}
          </button>
        ))}
        <span className="text-xs px-2" style={{ color: "#888" }}>Action</span>
      </div>

      {/* Rows */}
      {clients.map((client, idx) => (
        <div
          key={client.id}
          className="grid items-center px-2 py-1.5 transition-colors"
          style={{
            gridTemplateColumns: gridTemplate,
            background: idx % 2 === 0 ? "#0f0f0f" : "#131313",
            borderBottom: "1px solid #1e1e1e",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#1a1a1a"}
          onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? "#0f0f0f" : "#131313"}
        >
          {/* Row number */}
          <span className="text-xs text-center" style={{ color: "#444" }}>{idx + 1}</span>

          {/* Status badge */}
          {(() => {
            const status = client.client_status || "active";
            const badge = STATUS_BADGE[status] || STATUS_BADGE.active;
            return (
              <button className="text-xs font-bold px-2 py-0.5 rounded-full mx-1 transition-colors"
                style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}40` }}
                onClick={(e) => { e.stopPropagation(); onCycleStatus(client.id, status, e); }}
                title="Click to change status">
                {badge.label}
              </button>
            );
          })()}

          {GRID_COLUMNS.map((col) => {
            const isEditing = editingCell?.id === client.id && editingCell?.field === col.key;
            const rawValue = client[col.key as keyof Project] ?? "";

            if (isEditing) {
              return (
                <input
                  key={col.key}
                  className="text-xs px-2 py-1 rounded mx-1"
                  style={{ background: "#1e1e1e", border: "1px solid #ea580c", color: "#f0f0f0", outline: "none" }}
                  type={col.type || "text"}
                  value={editValue}
                  onChange={(e) => onEditChange(e.target.value)}
                  onBlur={onCommitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter") onCommitEdit(); if (e.key === "Escape") onCancelEdit(); }}
                  autoFocus
                />
              );
            }

            if (col.key === "business_name") {
              return (
                <button key={col.key} className="text-xs font-medium px-2 text-left truncate" style={{ color: "#f0f0f0" }}
                  onClick={() => onOpenProject(client)}>
                  {String(rawValue)}
                </button>
              );
            }

            if (col.key === "monthly_fee") {
              return (
                <span key={col.key} className="text-xs font-semibold px-2 cursor-pointer rounded py-0.5"
                  style={{ color: Number(rawValue) > 0 ? "#22c55e" : "#444" }}
                  onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}>
                  {Number(rawValue) > 0 ? `£${Number(rawValue).toFixed(2)}` : "—"}
                </span>
              );
            }

            if (col.key === "renewal_date") {
              const overdue = isOverdue(String(rawValue));
              return (
                <span key={col.key} className="text-xs px-2 cursor-pointer rounded py-0.5"
                  style={{ color: overdue ? "#ef4444" : rawValue ? "#ccc" : "#444" }}
                  onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}>
                  {rawValue ? formatDate(String(rawValue)) : "—"}{overdue && " !"}
                </span>
              );
            }

            if (col.key === "completed_at") {
              return <span key={col.key} className="text-xs px-2" style={{ color: "#888" }}>{rawValue ? formatDate(String(rawValue)) : "—"}</span>;
            }

            if (col.key === "domain") {
              return (
                <span key={col.key} className="text-xs px-2 truncate cursor-pointer" style={{ color: rawValue ? "#ea580c" : "#444" }}
                  onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}>
                  {String(rawValue) || "—"}
                </span>
              );
            }

            return (
              <span key={col.key} className={`text-xs px-2 truncate ${col.editable ? "cursor-pointer" : ""}`}
                style={{ color: rawValue ? "#ccc" : "#444" }}
                onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}>
                {String(rawValue) || "—"}
              </span>
            );
          })}

          {/* Action column */}
          <div className="px-2 flex items-center gap-1">
            {isLostView ? (
              <button className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: "#22c55e", border: "1px solid #22c55e30" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#22c55e20"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                onClick={(e) => onReactivate(client.id, e)}>
                Restore
              </button>
            ) : (
              <button className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: "#ef4444", border: "1px solid #ef444430" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#ef444420"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                onClick={(e) => onMarkLost(client.id, e)}>
                Lost
              </button>
            )}
            <button className="p-1 rounded transition-colors"
              style={{ color: "#555" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#ef444415"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; e.currentTarget.style.background = "transparent"; }}
              onClick={(e) => { e.stopPropagation(); onDelete(client.id); }}
              title="Delete permanently">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Card View ──────────────────────────────────────────────────── */

interface CardProps {
  clients: Project[];
  formatDate: (d: string) => string;
  isOverdue: (d: string) => boolean;
  onOpenProject: (p: Project) => void;
  isLostView: boolean;
  onMarkLost: (id: number, e?: React.MouseEvent) => void;
  onReactivate: (id: number, e?: React.MouseEvent) => void;
  onDelete: (id: number) => void;
  onCycleStatus: (id: number, currentStatus: string, e?: React.MouseEvent) => void;
  onSendInvoice: (id: number, e?: React.MouseEvent) => void;
  invoicing: number | null;
  onToggleInvoiceStatus: (id: number, currentStatus: string, e?: React.MouseEvent) => void;
}

function CardView({ clients, formatDate, isOverdue, onOpenProject, isLostView, onMarkLost, onReactivate, onDelete, onCycleStatus, onSendInvoice, invoicing, onToggleInvoiceStatus }: CardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {clients.map((client) => {
        const taskPct = client.tasks_total ? Math.round(((client.tasks_done || 0) / client.tasks_total) * 100) : 0;
        const overdue = isOverdue(client.renewal_date);

        return (
          <div
            key={client.id}
            className="rounded-xl overflow-hidden cursor-pointer transition-all relative"
            style={{ background: "#161616", border: `1px solid ${isLostView ? "#ef444440" : "#2a2a2a"}`, opacity: isLostView ? 0.75 : 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = isLostView ? "#ef4444" : "#444"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = isLostView ? "#ef444440" : "#2a2a2a"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.opacity = isLostView ? "0.75" : "1"; }}
            onClick={() => onOpenProject(client)}
          >
            {/* Invoice status badge — top left */}
            {!isLostView && (
              <button className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-xs font-bold transition-colors"
                style={{
                  background: (client.invoice_status === "invoiced") ? "#22c55e" : "#ef4444",
                  color: "#fff",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                }}
                onClick={(e) => onToggleInvoiceStatus(client.id, client.invoice_status || "to_invoice", e)}
                title="Click to toggle invoice status">
                {client.invoice_status === "invoiced" ? "INVOICED" : "TO INVOICE"}
              </button>
            )}

            {/* Client status badge — top right */}
            {(() => {
              const status = isLostView ? "lost" : (client.client_status || "active");
              const badge = STATUS_BADGE[status] || STATUS_BADGE.active;
              return (
                <button className="absolute top-2 right-2 z-10 px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors"
                  style={{ background: badge.color, color: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
                  onClick={(e) => { e.stopPropagation(); if (!isLostView) onCycleStatus(client.id, status, e); }}
                  title={isLostView ? "Lost client" : "Click to change status"}>
                  {badge.label}
                </button>
              );
            })()}

            {/* Cover Image */}
            {client.cover_image ? (
              <div className="w-full h-36 overflow-hidden" style={{ background: "#1e1e1e" }}>
                <img src={client.cover_image} alt={client.business_name || ""} className="w-full h-full object-cover" style={isLostView ? { filter: "grayscale(60%)" } : {}} />
              </div>
            ) : (
              <div className="w-full h-20 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%)" }}>
                <svg className="w-8 h-8" fill="none" stroke="#333" strokeWidth={1} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
              </div>
            )}

            {/* Card Body */}
            <div className="p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate" style={{ color: "#f0f0f0" }}>{client.business_name}</h3>
                  <p className="text-xs truncate" style={{ color: "#666" }}>
                    {client.contact_name}{client.business_type ? ` · ${client.business_type}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  {client.capex != null && client.capex > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "#ea580c20", color: "#ea580c" }}>
                      £{client.capex}
                    </span>
                  )}
                  {client.monthly_fee > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: isLostView ? "#ef444420" : "#22c55e20", color: isLostView ? "#ef4444" : "#22c55e" }}>
                      {isLostView ? "-" : ""}£{client.monthly_fee}/mo
                    </span>
                  )}
                </div>
              </div>

              {client.domain && (
                <p className="text-xs mt-1 truncate" style={{ color: "#ea580c" }}>{client.domain}</p>
              )}

              {client.tasks_total !== undefined && client.tasks_total > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: "#666" }}>Tasks</span>
                    <span style={{ color: "#888" }}>{client.tasks_done}/{client.tasks_total}</span>
                  </div>
                  <div className="w-full h-1 rounded-full" style={{ background: "#2a2a2a" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${taskPct}%`, background: taskPct === 100 ? "#22c55e" : "#ea580c" }} />
                  </div>
                </div>
              )}

              {/* Footer with action */}
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #2a2a2a" }}>
                <div className="flex items-center gap-2">
                  {client.email && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="#666" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  )}
                  {client.phone && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="#666" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {client.renewal_date && (
                    <span className="text-xs" style={{ color: overdue ? "#ef4444" : "#888" }}>
                      {overdue ? "Overdue: " : ""}{formatDate(client.renewal_date)}
                    </span>
                  )}
                  {isLostView ? (
                    <button className="text-xs px-2 py-0.5 rounded transition-colors"
                      style={{ color: "#22c55e", border: "1px solid #22c55e30" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#22c55e20"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      onClick={(e) => onReactivate(client.id, e)}>
                      Restore
                    </button>
                  ) : (
                    <button className="text-xs px-2 py-0.5 rounded transition-colors"
                      style={{ color: "#ef4444", border: "1px solid #ef444430" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#ef444420"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      onClick={(e) => onMarkLost(client.id, e)}>
                      Lost
                    </button>
                  )}
                  {!isLostView && client.monthly_fee > 0 && (
                    <button className="p-1 rounded transition-colors"
                      style={{ color: invoicing === client.id ? "#eab308" : "#555" }}
                      onMouseEnter={(e) => { if (invoicing !== client.id) { e.currentTarget.style.color = "#3b82f6"; e.currentTarget.style.background = "#3b82f615"; } }}
                      onMouseLeave={(e) => { if (invoicing !== client.id) { e.currentTarget.style.color = "#555"; e.currentTarget.style.background = "transparent"; } }}
                      onClick={(e) => onSendInvoice(client.id, e)}
                      disabled={invoicing === client.id}
                      title="Send Stripe invoice">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                      </svg>
                    </button>
                  )}
                  <button className="p-1 rounded transition-colors"
                    style={{ color: "#555" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#ef444415"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; e.currentTarget.style.background = "transparent"; }}
                    onClick={(e) => { e.stopPropagation(); onDelete(client.id); }}
                    title="Delete permanently">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
