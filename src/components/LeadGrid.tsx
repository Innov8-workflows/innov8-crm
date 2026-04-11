"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnDef,
  type VisibilityState,
  type RowSelectionState,
  type ColumnSizingState,
  type ColumnOrderState,
  type Header,
} from "@tanstack/react-table";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import type { Lead } from "@/types";
import { PIPELINE_STAGES, ROW_COLORS } from "@/types";
import EditableCell from "./EditableCell";
import StatusCheckbox from "./StatusCheckbox";
import TabBar from "./TabBar";
import EmailLogPanel from "./EmailLogPanel";
import DraggableRow from "./DraggableRow";
import ColumnHeaderEditor from "./ColumnHeaderEditor";
import StatsBar from "./StatsBar";
import PipelineBadge from "./PipelineBadge";
import FollowUpDate from "./FollowUpDate";
import LoadingAI from "./LoadingAI";
import { useToast } from "./Toast";

function DraggableColumnHeader({ header, onColumnDrop }: { header: Header<Lead, unknown>; onColumnDrop: (fromId: string, toId: string) => void }) {
  const [dragOver, setDragOver] = useState(false);

  const pinnedIds = ["select", "add_column", "actions", "drag_handle", "row_num"];
  const isPinned = pinnedIds.includes(header.id);

  return (
    <th
      className="px-1 py-2 text-left select-none relative group"
      draggable={!isPinned}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", header.id);
        e.dataTransfer.effectAllowed = "move";
        (e.currentTarget as HTMLElement).style.opacity = "0.5";
      }}
      onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      onDragOver={(e) => {
        if (isPinned) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const fromId = e.dataTransfer.getData("text/plain");
        if (fromId && fromId !== header.id) onColumnDrop(fromId, header.id);
      }}
      style={{
        width: header.getSize(),
        borderBottom: "1px solid var(--border)",
        position: "relative",
        cursor: isPinned ? undefined : "grab",
        borderLeft: dragOver ? "2px solid var(--accent)" : undefined,
      }}
    >
      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
      {/* Resize handle — wide hit area with visible drag line */}
      {header.column.getCanResize() && (
        <div
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); header.getResizeHandler()(e); }}
          onTouchStart={(e) => { e.stopPropagation(); header.getResizeHandler()(e); }}
          onPointerDown={(e) => { e.stopPropagation(); }}
          onDoubleClick={() => header.column.resetSize()}
          draggable={false}
          className="absolute top-0 h-full cursor-col-resize select-none touch-none"
          style={{ right: -6, width: 13, zIndex: 10 }}
          onMouseEnter={(e) => {
            const line = e.currentTarget.firstElementChild as HTMLElement;
            if (line && !header.column.getIsResizing()) { line.style.background = "var(--accent)"; line.style.width = "3px"; line.style.boxShadow = "0 0 8px #ea580c80"; }
          }}
          onMouseLeave={(e) => {
            const line = e.currentTarget.firstElementChild as HTMLElement;
            if (line && !header.column.getIsResizing()) { line.style.background = "var(--text-tertiary)"; line.style.width = "2px"; line.style.boxShadow = "none"; }
          }}
        >
          <div
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
            style={{
              width: header.column.getIsResizing() ? 3 : 2,
              background: header.column.getIsResizing() ? "var(--accent)" : "var(--text-tertiary)",
              boxShadow: header.column.getIsResizing() ? "0 0 8px #ea580c80" : "none",
              transition: "background 0.15s, width 0.15s, box-shadow 0.15s",
            }}
          />
        </div>
      )}
    </th>
  );
}

const TABS = ["All", "Plumbing", "Electrician", "Driveway", "Builder", "Beauty", "Hairdresser", "Dog Groomer", "LinkedIn SME", "Other"];

const columnHelper = createColumnHelper<Lead>();

interface ColConfig {
  id: string;
  label: string;
  col_type: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  business_name: "Business", contact_name: "Contact", business_type: "Business Type",
  location: "Location", website_status: "Website?", email: "Email", phone: "Number",
  emailed: "Emailed", messaged: "Messaged", responded: "Responded", followed_up: "Followed Up",
  capex: "CAPEX", notes: "Notes", status: "Stage", follow_up_date: "Follow Up", demo_site_url: "Demo Site",
  owner: "Owner",
};

const DEFAULT_TYPES: Record<string, string> = {
  business_name: "text", contact_name: "text", business_type: "text",
  location: "text", website_status: "checkbox", email: "email",
  phone: "phone", emailed: "checkbox", messaged: "checkbox",
  responded: "checkbox", followed_up: "checkbox", capex: "number",
  notes: "text", status: "pipeline", follow_up_date: "date", demo_site_url: "url",
  owner: "text",
};

export default function LeadGrid({ ownerFilter = "" }: { ownerFilter?: string }) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("text");
  const [newLead, setNewLead] = useState({ business_name: "", email: "", contact_name: "" });
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [colConfigs, setColConfigs] = useState<Record<string, ColConfig>>({});
  const [customColumns, setCustomColumns] = useState<ColConfig[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, Record<string, string>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState("");
  const [usersList, setUsersList] = useState<string[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Ref to prevent re-fetch on inline edit
  const skipNextFetch = useRef(false);

  // Restore column sizing and visibility from localStorage on mount
  useEffect(() => {
    try {
      const savedSizing = localStorage.getItem("crm_columnSizing");
      if (savedSizing) { const parsed = JSON.parse(savedSizing); if (parsed && Object.keys(parsed).length > 0) setColumnSizing(parsed); }
    } catch {}
    try {
      const savedVis = localStorage.getItem("crm_columnVisibility");
      if (savedVis) { const parsed = JSON.parse(savedVis); if (parsed && typeof parsed === "object") setColumnVisibility(parsed); }
    } catch {}
  }, []);

  // Restore and reconcile column order from localStorage
  // Only runs ONCE after custom columns have loaded from API
  const columnOrderInitialised = useRef(false);
  const customColumnsLoaded = useRef(false);

  // Track when custom columns finish loading (colConfigs set at same time)
  useEffect(() => {
    // customColumns starts as [] and gets set after API fetch
    // We detect "loaded" when the columns API has returned (even if there are no custom columns)
    // by checking if colConfigs has been populated
    if (Object.keys(colConfigs).length > 0 || customColumns.length > 0) {
      customColumnsLoaded.current = true;
    }
  }, [colConfigs, customColumns]);

  useEffect(() => {
    // Don't reconcile until custom columns have loaded — otherwise we'd strip them from saved order
    if (!customColumnsLoaded.current && !columnOrderInitialised.current) return;

    try {
      const savedOrder = localStorage.getItem("crm_columnOrder");
      const parsed = savedOrder ? JSON.parse(savedOrder) as string[] : [];

      if (!Array.isArray(parsed)) return;
      if (parsed.length === 0 && !columnOrderInitialised.current) return;

      const allBuiltIn = ["select", "drag_handle", "row_num", "owner", "status",
        "business_name", "contact_name", "business_type", "location",
        "follow_up_date", "website_status", "email", "phone", "demo_site_url",
        "emailed", "messaged", "responded", "followed_up", "capex", "notes",
        "add_column", "actions"];

      let changed = false;

      // Ensure "owner" is in the list
      if (!parsed.includes("owner")) {
        const statusIdx = parsed.indexOf("status");
        if (statusIdx !== -1) parsed.splice(statusIdx, 0, "owner");
        else parsed.push("owner");
        changed = true;
      }

      // Add any custom columns not already in saved order (new columns only)
      for (const cc of customColumns) {
        if (!parsed.includes(cc.id)) {
          const addIdx = parsed.indexOf("add_column");
          if (addIdx !== -1) parsed.splice(addIdx, 0, cc.id);
          else parsed.push(cc.id);
          changed = true;
        }
      }

      // Add any built-in columns not in saved order (new columns only)
      for (const bid of allBuiltIn) {
        if (!parsed.includes(bid)) {
          parsed.push(bid);
          changed = true;
        }
      }

      // Remove columns that no longer exist
      const validIds = new Set([...allBuiltIn, ...customColumns.map((c) => c.id)]);
      const cleaned = parsed.filter((id) => validIds.has(id));
      if (cleaned.length !== parsed.length) changed = true;

      // Only write to localStorage if we actually added/removed columns
      // NEVER overwrite if we're just restoring on load
      if (changed) {
        localStorage.setItem("crm_columnOrder", JSON.stringify(cleaned));
      }
      setColumnOrder(cleaned);
      columnOrderInitialised.current = true;
    } catch {}
  }, [customColumns, colConfigs]);

  // Get current user and users list
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (data.username) setCurrentUser(data.username);
    });
    fetch("/api/users").then((r) => r.json()).then((data) => {
      setUsersList(data.users || []);
    });
  }, []);

  // Load column configs + custom columns
  useEffect(() => {
    fetch("/api/columns").then((r) => r.json()).then((data) => {
      const configs: Record<string, ColConfig> = {};
      const custom: ColConfig[] = [];
      for (const col of data.columns || []) {
        const c = col as ColConfig;
        configs[c.id] = c;
        // Custom columns start with "custom_"
        if (c.id.startsWith("custom_")) custom.push(c);
      }
      setColConfigs(configs);
      setCustomColumns(custom);
    });
  }, []);

  // Load custom field values
  useEffect(() => {
    fetch("/api/custom-fields").then((r) => r.json()).then((data) => {
      const map: Record<string, Record<string, string>> = {};
      for (const v of data.values || []) {
        const leadId = String(v.lead_id);
        if (!map[leadId]) map[leadId] = {};
        map[leadId][v.field_id as string] = v.value as string;
      }
      setCustomFieldValues(map);
    });
  }, []);

  const getLabel = useCallback((id: string) => colConfigs[id]?.label || DEFAULT_LABELS[id] || id, [colConfigs]);
  const getColType = useCallback((id: string) => colConfigs[id]?.col_type || DEFAULT_TYPES[id] || "text", [colConfigs]);

  const saveColConfig = useCallback(async (columnId: string, label: string, colType: string) => {
    setColConfigs((prev) => ({ ...prev, [columnId]: { id: columnId, label, col_type: colType } }));
    await fetch("/api/columns", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: columnId, label, col_type: colType }),
    });
  }, []);

  const deleteColumn = useCallback(async (columnId: string) => {
    await fetch("/api/columns", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: columnId }),
    });
    setCustomColumns((prev) => prev.filter((c) => c.id !== columnId));
    setColConfigs((prev) => { const next = { ...prev }; delete next[columnId]; return next; });
    setCustomFieldValues((prev) => {
      const next = { ...prev };
      for (const leadId of Object.keys(next)) {
        const fields = { ...next[leadId] };
        delete fields[columnId];
        next[leadId] = fields;
      }
      return next;
    });
  }, []);

  const fetchLeads = useCallback(async () => {
    if (skipNextFetch.current) { skipNextFetch.current = false; return; }
    const params = new URLSearchParams();
    if (activeTab !== "All") params.set("business_type", activeTab);
    if (search) params.set("search", search);
    if (ownerFilter) params.set("owner", ownerFilter);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads || []);
    setLoading(false);
  }, [activeTab, search, ownerFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Stable update: only update local state, no re-fetch
  // Determine the correct auto-stage based on all checkbox states
  const getAutoStage = useCallback((leadId: number, overrideField?: string, overrideValue?: number | string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return null;
    const s = lead.status || "new";
    // Don't touch manually-set advanced stages
    if (["meeting_booked", "maybe", "won", "lost", "rejected"].includes(s)) return null;

    // Gather current checkbox states, applying the override for the field being changed
    const get = (field: string, customId?: string) => {
      if (overrideField === field || overrideField === customId) return overrideValue === 1 || overrideValue === "1";
      if (customId) return customFieldValues[String(leadId)]?.[customId] === "1";
      return !!(lead as unknown as Record<string, unknown>)[field];
    };

    const called = get("", "custom_called");
    const messaged = get("messaged") || get("", "custom_fb_messenger");
    const emailed = get("emailed");

    // Return the highest applicable stage
    if (called) return "called";
    if (messaged) return "messaged";
    if (emailed) return "emailed";
    return "new";
  }, [leads, customFieldValues]);

  const updateLead = useCallback(async (id: number, field: string, value: string | number | null) => {
    // Auto-set stage when checkbox changes (forward or backward)
    let autoStage: string | null = null;
    if (["emailed", "messaged"].includes(field) && (value === 1 || value === 0)) {
      autoStage = getAutoStage(id, field, value as number);
    }

    // Update local state (checkbox + stage if auto-changing)
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (autoStage) updated.status = autoStage;
      return updated;
    }));
    skipNextFetch.current = true;

    // Send both updates to backend in one call
    const updates: Record<string, unknown> = { [field]: value };
    if (autoStage) updates.status = autoStage;
    await fetch(`/api/leads/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (autoStage) {
      const lead = leads.find((l) => l.id === id);
      if (autoStage !== (lead?.status || "new")) toast(`Stage → ${autoStage}`);
    }

    // Auto-create project when lead is marked as "won"
    if (field === "status" && value === "won") {
      await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: id }),
      });
      toast("Lead won — project created!");
    }
  }, [leads, toast, getAutoStage]);

  // Update custom field value
  const updateCustomField = useCallback(async (leadId: number, fieldId: string, value: string) => {
    // Auto-set stage when custom_called or custom_fb_messenger changes
    let autoStage: string | null = null;
    if (["custom_called", "custom_fb_messenger"].includes(fieldId) && (value === "1" || value === "0")) {
      autoStage = getAutoStage(leadId, fieldId, value);
    }

    setCustomFieldValues((prev) => ({
      ...prev,
      [String(leadId)]: { ...(prev[String(leadId)] || {}), [fieldId]: value },
    }));

    // If stage should change, update lead status too
    if (autoStage) {
      const lead = leads.find((l) => l.id === leadId);
      if (autoStage !== (lead?.status || "new")) {
        setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: autoStage! } : l));
        skipNextFetch.current = true;
        await fetch(`/api/leads/${leadId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: autoStage }),
        });
        toast(`Stage → ${autoStage}`);
      }
    }

    await fetch("/api/custom-fields", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, field_id: fieldId, value }),
    });
  }, [leads, toast, getAutoStage]);

  // Add custom column
  const addCustomColumn = useCallback(async () => {
    if (!newColName.trim()) return;
    const id = "custom_" + newColName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
    await fetch("/api/columns", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label: newColName.trim(), col_type: newColType }),
    });
    const newConfig = { id, label: newColName.trim(), col_type: newColType };
    setColConfigs((prev) => ({ ...prev, [id]: newConfig }));
    setCustomColumns((prev) => [...prev, newConfig]);
    setNewColName("");
    setNewColType("text");
    setShowAddColumnModal(false);
  }, [newColName, newColType]);

  const checkDuplicate = useCallback(async (name: string, email: string) => {
    if (!name && !email) { setDuplicateWarning(""); return; }
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (email) params.set("email", email);
    const res = await fetch(`/api/leads/check-duplicate?${params}`);
    const data = await res.json();
    setDuplicateWarning(data.hasDuplicates
      ? `Possible duplicate: ${data.duplicates.map((d: { business_name: string }) => d.business_name).join(", ")}`
      : "");
  }, []);

  // Add lead — always appends at bottom (API handles sort_order)
  const addLead = useCallback(async () => {
    if (!newLead.business_name.trim()) return;
    const res = await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newLead, business_type: activeTab !== "All" ? activeTab : "" }),
    });
    const lead = await res.json();
    setLeads((prev) => [...prev, lead]);
    setNewLead({ business_name: "", email: "", contact_name: "" });
    setShowAddModal(false);
    setDuplicateWarning("");
    toast("Lead added");
  }, [newLead, activeTab, toast]);

  const deleteLead = useCallback(async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this lead? This cannot be undone.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    skipNextFetch.current = true;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    toast("Lead deleted", "info");
  }, [toast]);

  // Bulk actions
  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection).filter((k) => rowSelection[k]).map((k) => {
      const row = leads[Number(k)];
      return row?.id;
    }).filter(Boolean);
  }, [rowSelection, leads]);

  const bulkAction = useCallback(async (action: string, field?: string, value?: string | number) => {
    if (selectedIds.length === 0) return;
    await fetch("/api/leads/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids: selectedIds, field, value }),
    });
    setRowSelection({});
    setShowBulkMenu(false);
    fetchLeads();
  }, [selectedIds, fetchLeads]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/leads/import", { method: "POST", body: formData });
    const data = await res.json();
    alert(`Imported ${data.imported} leads, skipped ${data.skipped} duplicates`);
    setShowImportModal(false);
    fetchLeads();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [fetchLeads]);

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLeads((prev) => {
      const oldIndex = prev.findIndex((l) => l.id === active.id);
      const newIndex = prev.findIndex((l) => l.id === over.id);
      const newOrder = arrayMove(prev, oldIndex, newIndex);
      fetch("/api/leads/reorder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: newOrder.map((l) => l.id) }),
      });
      return newOrder;
    });
  }, []);

  const handleExport = useCallback((format: "xlsx" | "csv") => {
    const params = new URLSearchParams({ format });
    if (activeTab !== "All") params.set("business_type", activeTab);
    window.open(`/api/leads/export?${params}`, "_blank");
    setShowExportMenu(false);
  }, [activeTab]);

  // Built-in fields
  const editableFields = useMemo(() => [
    "owner", "status", "business_name", "contact_name", "business_type", "location",
    "follow_up_date", "website_status", "email", "phone", "demo_site_url",
    "emailed", "messaged", "responded", "followed_up", "capex", "notes",
  ], []);

  const renderCell = useCallback(
    (id: number, field: string, value: unknown, colType: string) => {
      if (field === "owner") {
        const current = (value as string) || "";
        const ownerColor = current === "Truthfu1" ? "var(--accent)" : current.toLowerCase() === "lowkey" ? "#22d3ee" : "var(--text-tertiary)";
        return (
          <select
            className="text-xs rounded px-1 py-0.5 w-full cursor-pointer font-semibold"
            style={{ background: "transparent", color: ownerColor, border: "none", outline: "none" }}
            value={current}
            onChange={(e) => updateLead(id, field, e.target.value)}
          >
            <option value="" style={{ background: "var(--surface2)", color: "var(--text-tertiary)" }}>—</option>
            {usersList.map((u) => (
              <option key={u} value={u} style={{ background: "var(--surface2)", color: u === "Truthfu1" ? "var(--accent)" : u === "LowKey" ? "#c084fc" : "var(--text)" }}>{u}</option>
            ))}
          </select>
        );
      }
      if (field === "status") return <PipelineBadge value={(value as string) || "new"} onChange={(v) => updateLead(id, field, v)} />;
      if (field === "follow_up_date") return <FollowUpDate value={(value as string) || ""} onChange={(v) => updateLead(id, field, v)} />;
      if (field === "demo_site_url") {
        const url = value as string;
        return url
          ? <div className="flex items-center gap-1 px-2 py-1">
              <a href={url} target="_blank" rel="noreferrer" className="hover:underline text-xs truncate" style={{ color: "var(--accent)" }} title={url}>View site</a>
              <button onClick={() => updateLead(id, field, "")} className="flex-shrink-0 rounded hover:bg-red-900/30 p-0.5" title="Clear link" style={{ color: "var(--text-dim)", lineHeight: 1 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          : <EditableCell value="" onSave={(v) => updateLead(id, field, v)} />;
      }
      if (colType === "checkbox") {
        return <StatusCheckbox checked={!!value} onChange={(v) => updateLead(id, field, v ? 1 : 0)}
          color={field === "website_status" ? "red" : field === "responded" ? "blue" : field === "followed_up" ? "orange" : "green"} />;
      }
      return <EditableCell value={(value as string | number) ?? ""} type={colType === "number" ? "number" : "text"}
        onSave={(v) => updateLead(id, field, colType === "number" && v === "" ? null : v)} />;
    },
    [updateLead, usersList]
  );

  const columns = useMemo<ColumnDef<Lead, unknown>[]>(
    () => [
      columnHelper.display({ id: "select", header: ({ table }) => (
        <input type="checkbox" className="rounded" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />
      ), size: 30, enableResizing: false, cell: ({ row }) => (
        <input type="checkbox" className="rounded" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
      )}),
      columnHelper.display({ id: "drag_handle", header: "", size: 24, enableResizing: false, cell: () => (
        <div className="cursor-grab active:cursor-grabbing flex justify-center" style={{ color: "var(--border-light)" }}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-dim)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--border-light)"}>
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
          </svg>
        </div>
      )}),
      columnHelper.display({ id: "row_num", header: "#", size: 35, enableResizing: false,
        cell: (info) => <span className="text-xs" style={{ color: "var(--text-quaternary)" }}>{info.row.index + 1}</span> }),
      // Built-in editable columns
      ...(editableFields.map((field) =>
        columnHelper.accessor(field as keyof Lead, {
          id: field,
          header: ({ column }) => (
            <ColumnHeaderEditor columnId={field} label={getLabel(field)} colType={getColType(field)}
              onSave={saveColConfig} onSort={column.getToggleSortingHandler()} sortDir={column.getIsSorted()} />
          ),
          size: field === "business_name" ? 200 : field === "notes" ? 180 : field === "email" ? 180 :
            field === "phone" ? 120 : field === "status" ? 110 : field === "follow_up_date" ? 90 :
            field === "demo_site_url" ? 80 : field === "owner" ? 90 :
            ["emailed", "messaged", "responded", "followed_up", "website_status"].includes(field) ? 70 :
            field === "capex" ? 70 : 100,
          minSize: 40,
          enableResizing: true,
          cell: (info) => renderCell(info.row.original.id, field, info.getValue(), getColType(field)),
        })
      ) as ColumnDef<Lead, unknown>[]),
      // Custom columns
      ...customColumns.map((cc) =>
        columnHelper.display({
          id: cc.id,
          header: ({ column }) => (
            <ColumnHeaderEditor columnId={cc.id} label={cc.label} colType={cc.col_type}
              onSave={saveColConfig} onSort={column.getToggleSortingHandler()} sortDir={column.getIsSorted()}
              onDelete={deleteColumn} />
          ),
          size: 120,
          minSize: 40,
          enableResizing: true,
          cell: (info) => {
            const leadId = info.row.original.id;
            const val = customFieldValues[String(leadId)]?.[cc.id] || "";
            if (cc.col_type === "checkbox") {
              return <StatusCheckbox checked={val === "1"} onChange={(v) => updateCustomField(leadId, cc.id, v ? "1" : "0")} color="green" />;
            }
            return <EditableCell value={val} type={cc.col_type === "number" ? "number" : "text"}
              onSave={(v) => updateCustomField(leadId, cc.id, String(v))} />;
          },
        })
      ),
      // "+" Add column button
      columnHelper.display({
        id: "add_column",
        header: () => (
          <button onClick={() => setShowAddColumnModal(true)}
            className="w-full flex justify-center transition-colors" style={{ color: "var(--text-quaternary)" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-quaternary)"}
            title="Add column">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        ),
        size: 36,
        enableResizing: false,
        cell: () => null,
      }),
      columnHelper.display({
        id: "actions", header: "", size: 50, enableResizing: false,
        cell: (info) => (
          <div className="flex gap-0.5 justify-center">
            <button className="p-1" style={{ color: "var(--text-quaternary)" }} title="View details"
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent)"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-quaternary)"}
              onClick={(e) => { e.stopPropagation(); setSelectedLead(info.row.original); }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button className="p-1" style={{ color: "var(--text-quaternary)" }} title="Delete"
              onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"} onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-quaternary)"}
              onClick={(e) => { e.stopPropagation(); deleteLead(info.row.original.id); }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ),
      }),
    ],
    [editableFields, customColumns, customFieldValues, getLabel, getColType, saveColConfig, deleteColumn, renderCell, deleteLead, updateCustomField]
  );

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnSizing, columnOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        try { localStorage.setItem("crm_columnVisibility", JSON.stringify(next)); } catch {}
        return next;
      });
    },
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: (updater) => {
      setColumnSizing((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        try { localStorage.setItem("crm_columnSizing", JSON.stringify(next)); } catch {}
        return next;
      });
    },
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  // Native HTML5 drag & drop for column reordering (dnd-kit doesn't work for columns in tables)
  const handleColumnDrop = useCallback((fromId: string, toId: string) => {
    setColumnOrder((prev) => {
      const currentOrder = prev.length > 0 ? prev : table.getAllLeafColumns().map((c) => c.id);
      const oldIndex = currentOrder.indexOf(fromId);
      const newIndex = currentOrder.indexOf(toId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      try { localStorage.setItem("crm_columnOrder", JSON.stringify(newOrder)); } catch {}
      return newOrder;
    });
  }, [table]);

  const handleExportPdf = useCallback(() => {
    setShowExportMenu(false);
    const visible = table.getVisibleLeafColumns().map((c) => c.id).filter((id) => id !== "select");
    const rows = table.getFilteredRowModel().rows;
    const now = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const title = activeTab === "All" ? "All Prospects" : `${activeTab} Prospects`;

    const labelMap: Record<string, string> = { ...DEFAULT_LABELS };
    for (const [k, v] of Object.entries(colConfigs)) labelMap[k] = v.label;

    const checkFields = ["website_status", "emailed", "messaged", "responded", "followed_up"];

    const thCells = visible.map((id) => `<th style="padding:6px 10px;text-align:left;border-bottom:2px solid #ea580c;font-size:11px;color:#333;white-space:nowrap">${labelMap[id] || id}</th>`).join("");
    const bodyRows = rows.map((row, i) => {
      const bg = i % 2 === 0 ? "#fff" : "#fafafa";
      const cells = visible.map((id) => {
        const val = row.original[id as keyof typeof row.original] ?? "";
        let display = String(val);
        if (checkFields.includes(id)) display = val ? "Yes" : "No";
        if (id === "capex" && val) display = `£${Number(val).toFixed(2)}`;
        if (id === "status") {
          const stage = PIPELINE_STAGES.find((s) => s.value === val);
          display = stage?.label || display;
        }
        return `<td style="padding:5px 10px;font-size:10px;color:#444;border-bottom:1px solid #eee;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${display || "—"}</td>`;
      }).join("");
      return `<tr style="background:${bg}">${cells}</tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>${title} - innov8 CRM</title>
<style>@page{size:landscape;margin:12mm}body{font-family:-apple-system,sans-serif;margin:0;padding:20px}table{width:100%;border-collapse:collapse}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
</head><body>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
  <div>
    <h1 style="margin:0;font-size:18px;color:#0f0f0f">${title}</h1>
    <p style="margin:2px 0 0;font-size:11px;color:#888">${rows.length} leads · Exported ${now}</p>
  </div>
  <div style="font-size:14px;font-weight:700;color:#ea580c">innov8 CRM</div>
</div>
<table><thead><tr>${thCells}</tr></thead><tbody>${bodyRows}</tbody></table>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); }; }
  }, [activeTab, colConfigs, table]);

  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);

  const btnStyle = { background: "transparent", border: "1px solid var(--border-light)", color: "var(--text-secondary)", borderRadius: "6px" };
  const btnHover = (e: React.MouseEvent) => { (e.target as HTMLElement).style.background = "var(--surface3)"; };
  const btnLeave = (e: React.MouseEvent) => { (e.target as HTMLElement).style.background = "transparent"; };
  const modalBg = { background: "var(--surface)", border: "1px solid var(--border)" };
  const inputStyle = { background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" };
  const dropdownStyle = { background: "var(--surface2)", border: "1px solid var(--border-light)" };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Prospects</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>{leads.length} leads</span>
          <button onClick={() => setShowImportModal(true)} style={btnStyle} onMouseEnter={btnHover} onMouseLeave={btnLeave}
            className="px-3 py-1.5 text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>Import
          </button>
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} style={btnStyle} onMouseEnter={btnHover} onMouseLeave={btnLeave}
              className="px-3 py-1.5 text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl z-40 py-1" style={dropdownStyle}>
                <button className="w-full text-left px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#252525"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={handleExportPdf}>Export as PDF</button>
                <button className="w-full text-left px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#252525"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={() => handleExport("xlsx")}>Export as Excel (.xlsx)</button>
                <button className="w-full text-left px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#252525"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={() => handleExport("csv")}>Export as CSV</button>
              </div>
            )}
          </div>
          <button onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 text-sm font-semibold rounded-md transition-colors" style={{ background: "var(--accent)", color: "#fff" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}>+ New Lead</button>

          {/* User menu */}
          <div className="relative ml-1">
            <button onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-2 py-1 rounded-md transition-colors"
              style={{ border: "1px solid var(--border)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {currentUser ? currentUser[0].toUpperCase() : "?"}
              </div>
              <span className="text-sm hidden sm:inline" style={{ color: "var(--text-secondary)" }}>{currentUser}</span>
              <svg className="w-3.5 h-3.5" style={{ color: "var(--text-dim)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl z-50 py-1"
                style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
                <div className="px-3 py-2 text-xs" style={{ color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                  Signed in as <span style={{ color: "var(--text-secondary)" }}>{currentUser}</span>
                </div>
                <button
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                  style={{ color: "#ef4444" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/login";
                  }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <StatsBar ownerFilter={ownerFilter} />
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-2 w-4 h-4" style={{ color: "var(--text-tertiary)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Search leads..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md" style={inputStyle}
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {selectedIds.length > 0 && (
          <div className="relative">
            <button className="px-3 py-1.5 text-sm font-medium rounded-md" style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => setShowBulkMenu(!showBulkMenu)}>
              {selectedIds.length} selected — Bulk actions
            </button>
            {showBulkMenu && (
              <div className="absolute top-full mt-1 left-0 w-56 rounded-lg shadow-xl z-40 py-1" style={dropdownStyle}>
                <div className="px-3 py-1 text-xs uppercase" style={{ color: "var(--text-tertiary)" }}>Set stage</div>
                {PIPELINE_STAGES.map((s) => (
                  <button key={s.value} className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface3)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    onClick={() => bulkAction("update", "status", s.value)}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
                  </button>
                ))}
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <button className="w-full text-left px-3 py-1.5 text-sm" style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#252525"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={() => bulkAction("update", "emailed", 1)}>Mark as Emailed</button>
                <button className="w-full text-left px-3 py-1.5 text-sm" style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#252525"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={() => bulkAction("update", "messaged", 1)}>Mark as Messaged</button>
                <button className="w-full text-left px-3 py-1.5 text-sm" style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#252525"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={() => bulkAction("update", "responded", 1)}>Mark as Responded</button>
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <button className="w-full text-left px-3 py-1.5 text-sm" style={{ color: "#ef4444" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.1)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={() => { if (confirm(`Delete ${selectedIds.length} leads?`)) bulkAction("delete"); }}>Delete selected</button>
              </div>
            )}
          </div>
        )}
        <div className="relative">
          <button style={btnStyle} onMouseEnter={btnHover} onMouseLeave={btnLeave}
            className="px-3 py-1.5 text-sm rounded-md" onClick={() => setShowColumnMenu(!showColumnMenu)}>Columns</button>
          {showColumnMenu && (
            <div className="absolute top-full mt-1 right-0 w-48 rounded-lg shadow-xl z-40 py-1 max-h-80 overflow-auto" style={dropdownStyle}>
              {table.getAllLeafColumns()
                .filter((c) => !["row_num", "actions", "drag_handle", "select", "add_column"].includes(c.id))
                .map((column) => (
                  <label key={column.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface3)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()}
                      style={{ accentColor: "var(--accent)" }} />
                    {getLabel(column.id)}
                  </label>
                ))}
            </div>
          )}
        </div>
        <span className="text-xs hidden lg:inline" style={{ color: "var(--text-quaternary)" }}>Drag column edges to resize</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
          <table className="text-sm border-collapse" style={{ width: table.getTotalSize(), tableLayout: "fixed" }}>
            <thead className="sticky top-0 z-10" style={{ background: "var(--surface)" }}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <DraggableColumnHeader key={header.id} header={header} onColumnDrop={handleColumnDrop} />
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="text-center py-8"><div className="flex justify-center"><LoadingAI message="Loading prospects" /></div></td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-8" style={{ color: "var(--text-tertiary)" }}>No leads found</td></tr>
              ) : (
                <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
                  {table.getRowModel().rows.map((row) => (
                    <DraggableRow key={row.id} row={row} />
                  ))}
                </SortableContext>
              )}
            </tbody>
          </table>
        </DndContext>
      </div>

      {selectedLead && <EmailLogPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowAddModal(false)}>
          <div className="rounded-xl shadow-2xl w-full max-w-md p-6" style={modalBg} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text)" }}>Add New Lead</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Business Name *</label>
                <input className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle}
                  value={newLead.business_name} autoFocus
                  onChange={(e) => { setNewLead((p) => ({ ...p, business_name: e.target.value })); checkDuplicate(e.target.value, newLead.email); }} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Contact Name</label>
                <input className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle}
                  value={newLead.contact_name} onChange={(e) => setNewLead((p) => ({ ...p, contact_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Email</label>
                <input className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle}
                  value={newLead.email}
                  onChange={(e) => { setNewLead((p) => ({ ...p, email: e.target.value })); checkDuplicate(newLead.business_name, e.target.value); }} />
              </div>
              {duplicateWarning && (
                <div className="px-3 py-2 rounded-md text-sm" style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)", color: "#eab308" }}>{duplicateWarning}</div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="px-4 py-2 text-sm" style={{ color: "var(--text-dim)" }} onClick={() => { setShowAddModal(false); setDuplicateWarning(""); }}>Cancel</button>
              <button className="px-4 py-2 text-sm font-semibold rounded-md" style={{ background: "var(--accent)", color: "#fff" }} onClick={addLead}>Add Lead</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowImportModal(false)}>
          <div className="rounded-xl shadow-2xl w-full max-w-md p-6" style={modalBg} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--text)" }}>Import Leads</h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-dim)" }}>Upload CSV or Excel. Duplicates will be skipped.</p>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImport}
              className="w-full text-sm rounded-md p-2" style={{ ...inputStyle, cursor: "pointer" }} />
            <div className="flex justify-end mt-4">
              <button className="px-4 py-2 text-sm" style={{ color: "var(--text-dim)" }} onClick={() => setShowImportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      {showAddColumnModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowAddColumnModal(false)}>
          <div className="rounded-xl shadow-2xl w-full max-w-sm p-6" style={modalBg} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text)" }}>Add Column</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Column Name</label>
                <input className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle}
                  value={newColName} onChange={(e) => setNewColName(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomColumn(); }} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Type</label>
                <select className="w-full px-3 py-2 rounded-md text-sm" style={inputStyle}
                  value={newColType} onChange={(e) => setNewColType(e.target.value)}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="url">URL</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="px-4 py-2 text-sm" style={{ color: "var(--text-dim)" }} onClick={() => setShowAddColumnModal(false)}>Cancel</button>
              <button className="px-4 py-2 text-sm font-semibold rounded-md" style={{ background: "var(--accent)", color: "#fff" }} onClick={addCustomColumn}>Add Column</button>
            </div>
          </div>
        </div>
      )}

      {(showColumnMenu || showExportMenu || showBulkMenu || showUserMenu) && (
        <div className="fixed inset-0 z-30" onClick={() => { setShowColumnMenu(false); setShowExportMenu(false); setShowBulkMenu(false); setShowUserMenu(false); }} />
      )}
    </div>
  );
}
