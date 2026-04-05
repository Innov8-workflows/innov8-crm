"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Project } from "@/types";
import ProjectDetailModal from "./ProjectDetailModal";

interface ClientStats {
  mrr: number;
  capex: number;
  clientCount: number;
  overdueRenewals: number;
}

type SortKey = "business_name" | "contact_name" | "business_type" | "location" | "monthly_fee" | "renewal_date" | "domain" | "completed_at";
type SortDir = "asc" | "desc";
type ViewMode = "grid" | "card";

export default function LiveClients() {
  const [clients, setClients] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("business_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const fetchClients = useCallback(async () => {
    const res = await fetch("/api/projects?completed=true");
    const data = await res.json();
    setClients(data.projects || []);
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/clients/stats");
    setStats(await res.json());
  }, []);

  useEffect(() => { fetchClients(); fetchStats(); }, [fetchClients, fetchStats]);

  const updateClient = useCallback(async (id: number, field: string, value: string | number) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    await fetch(`/api/projects/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
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

  if (loading) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "#555" }}>Loading clients...</div>;
  }

  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      {/* Dashboard Stats */}
      <div style={{ background: "#131313", borderBottom: "1px solid #2a2a2a" }}>
        <div className="grid grid-cols-4 gap-3 px-4 py-3">
          {[
            { label: "Live Clients", value: stats?.clientCount ?? clients.length, color: "#f0f0f0", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
            { label: "Monthly Revenue", value: `£${(stats?.mrr ?? 0).toFixed(2)}`, color: "#22c55e", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
            { label: "Total CAPEX", value: `£${(stats?.capex ?? 0).toFixed(2)}`, color: "#ea580c", icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
            { label: "Overdue Renewals", value: stats?.overdueRenewals ?? 0, color: stats?.overdueRenewals ? "#ef4444" : "#666", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
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

      {/* Toolbar: Search + View Toggle */}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-sm">No live clients yet</p>
            <p className="text-xs mt-1">Complete projects to see them here</p>
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
          />
        ) : (
          <CardView
            clients={filtered}
            formatDate={formatDate}
            isOverdue={isOverdue}
            onOpenProject={setSelectedProject}
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
        />
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
}

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

function GridView({ clients, sortKey, sortDir, onSort, editingCell, editValue, onStartEdit, onEditChange, onCommitEdit, onCancelEdit, formatDate, isOverdue, onOpenProject }: GridProps) {
  const gridTemplate = `40px ${GRID_COLUMNS.map((c) => c.width).join(" ")}`;

  return (
    <div style={{ minWidth: 900 }}>
      {/* Header */}
      <div className="grid items-center px-2 py-1.5 sticky top-0 z-10" style={{ gridTemplateColumns: gridTemplate, background: "#161616", borderBottom: "1px solid #2a2a2a" }}>
        <div />
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

            // Special rendering per column
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
                <span
                  key={col.key}
                  className="text-xs font-semibold px-2 cursor-pointer rounded py-0.5"
                  style={{ color: Number(rawValue) > 0 ? "#22c55e" : "#444" }}
                  onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}
                >
                  {Number(rawValue) > 0 ? `£${Number(rawValue).toFixed(2)}` : "—"}
                </span>
              );
            }

            if (col.key === "renewal_date") {
              const overdue = isOverdue(String(rawValue));
              return (
                <span
                  key={col.key}
                  className="text-xs px-2 cursor-pointer rounded py-0.5"
                  style={{ color: overdue ? "#ef4444" : rawValue ? "#ccc" : "#444" }}
                  onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}
                >
                  {rawValue ? formatDate(String(rawValue)) : "—"}
                  {overdue && " !"}
                </span>
              );
            }

            if (col.key === "completed_at") {
              return (
                <span key={col.key} className="text-xs px-2" style={{ color: "#888" }}>
                  {rawValue ? formatDate(String(rawValue)) : "—"}
                </span>
              );
            }

            if (col.key === "domain") {
              return (
                <span
                  key={col.key}
                  className="text-xs px-2 truncate cursor-pointer"
                  style={{ color: rawValue ? "#ea580c" : "#444" }}
                  onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}
                >
                  {String(rawValue) || "—"}
                </span>
              );
            }

            return (
              <span
                key={col.key}
                className={`text-xs px-2 truncate ${col.editable ? "cursor-pointer" : ""}`}
                style={{ color: rawValue ? "#ccc" : "#444" }}
                onClick={() => col.editable && onStartEdit(client.id, col.key, rawValue as string | number)}
              >
                {String(rawValue) || "—"}
              </span>
            );
          })}
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
}

function CardView({ clients, formatDate, isOverdue, onOpenProject }: CardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {clients.map((client) => {
        const taskPct = client.tasks_total ? Math.round(((client.tasks_done || 0) / client.tasks_total) * 100) : 0;
        const overdue = isOverdue(client.renewal_date);

        return (
          <div
            key={client.id}
            className="rounded-xl overflow-hidden cursor-pointer transition-all"
            style={{ background: "#161616", border: "1px solid #2a2a2a" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.transform = "translateY(0)"; }}
            onClick={() => onOpenProject(client)}
          >
            {/* Cover Image */}
            {client.cover_image ? (
              <div className="w-full h-36 overflow-hidden" style={{ background: "#1e1e1e" }}>
                <img src={client.cover_image} alt={client.business_name || ""} className="w-full h-full object-cover" />
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
              {/* Header */}
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate" style={{ color: "#f0f0f0" }}>{client.business_name}</h3>
                  <p className="text-xs truncate" style={{ color: "#666" }}>
                    {client.contact_name}{client.business_type ? ` · ${client.business_type}` : ""}
                  </p>
                </div>
                {/* Monthly fee badge */}
                {client.monthly_fee > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2" style={{ background: "#22c55e20", color: "#22c55e" }}>
                    £{client.monthly_fee}/mo
                  </span>
                )}
              </div>

              {/* Domain */}
              {client.domain && (
                <p className="text-xs mt-1 truncate" style={{ color: "#ea580c" }}>{client.domain}</p>
              )}

              {/* Task progress bar */}
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

              {/* Footer */}
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
                {client.renewal_date && (
                  <span className="text-xs" style={{ color: overdue ? "#ef4444" : "#888" }}>
                    {overdue ? "Overdue: " : ""}{formatDate(client.renewal_date)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
