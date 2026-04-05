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

const TABS = ["All", "Plumbing", "Electrician", "Driveway", "Other"];

const columnHelper = createColumnHelper<Lead>();

interface ColConfig {
  id: string;
  label: string;
  col_type: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  business_name: "Business",
  contact_name: "Owner",
  business_type: "Business Type",
  location: "Location",
  website_status: "Website?",
  email: "Email",
  phone: "Number",
  emailed: "Emailed",
  messaged: "Messaged",
  responded: "Responded",
  followed_up: "Followed Up",
  capex: "CAPEX",
  notes: "Notes",
  status: "Stage",
  follow_up_date: "Follow Up",
  demo_site_url: "Demo Site",
};

const DEFAULT_TYPES: Record<string, string> = {
  business_name: "text", contact_name: "text", business_type: "text",
  location: "text", website_status: "checkbox", email: "email",
  phone: "phone", emailed: "checkbox", messaged: "checkbox",
  responded: "checkbox", followed_up: "checkbox", capex: "number",
  notes: "text", status: "pipeline", follow_up_date: "date",
  demo_site_url: "url",
};

export default function LeadGrid() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newLead, setNewLead] = useState({ business_name: "", email: "", contact_name: "" });
  const [duplicateWarning, setDuplicateWarning] = useState<string>("");
  const [colConfigs, setColConfigs] = useState<Record<string, ColConfig>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Column configs
  useEffect(() => {
    fetch("/api/columns").then((r) => r.json()).then((data) => {
      const configs: Record<string, ColConfig> = {};
      for (const col of data.columns || []) configs[col.id as string] = col as ColConfig;
      setColConfigs(configs);
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

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeTab !== "All") params.set("business_type", activeTab);
    if (search) params.set("search", search);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads || []);
    setLoading(false);
  }, [activeTab, search]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const updateLead = useCallback(async (id: number, field: string, value: string | number | null) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
    await fetch(`/api/leads/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }, []);

  // Add lead with duplicate detection
  const checkDuplicate = useCallback(async (name: string, email: string) => {
    if (!name && !email) { setDuplicateWarning(""); return; }
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (email) params.set("email", email);
    const res = await fetch(`/api/leads/check-duplicate?${params}`);
    const data = await res.json();
    if (data.hasDuplicates) {
      const names = data.duplicates.map((d: { business_name: string }) => d.business_name).join(", ");
      setDuplicateWarning(`Possible duplicate: ${names}`);
    } else {
      setDuplicateWarning("");
    }
  }, []);

  const addLead = useCallback(async () => {
    if (!newLead.business_name.trim()) return;
    const res = await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newLead,
        business_type: activeTab !== "All" ? activeTab : "",
      }),
    });
    const lead = await res.json();
    setLeads((prev) => [...prev, lead]);
    setNewLead({ business_name: "", email: "", contact_name: "" });
    setShowAddModal(false);
    setDuplicateWarning("");
  }, [newLead, activeTab]);

  const deleteLead = useCallback(async (id: number) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }, []);

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

  // Import
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

  // Columns
  const editableFields = useMemo(() => [
    "status", "business_name", "contact_name", "business_type", "location",
    "follow_up_date", "website_status", "email", "phone", "demo_site_url",
    "emailed", "messaged", "responded", "followed_up", "capex", "notes",
  ], []);

  const renderCell = useCallback(
    (id: number, field: string, value: unknown, colType: string) => {
      if (field === "status") {
        return <PipelineBadge value={(value as string) || "new"} onChange={(v) => updateLead(id, field, v)} />;
      }
      if (field === "follow_up_date") {
        return <FollowUpDate value={(value as string) || ""} onChange={(v) => updateLead(id, field, v)} />;
      }
      if (field === "demo_site_url") {
        const url = value as string;
        if (url) {
          return (
            <a href={url} target="_blank" rel="noreferrer"
              className="text-blue-600 hover:underline text-xs truncate block px-2 py-1" title={url}>
              View site
            </a>
          );
        }
        return (
          <EditableCell value="" onSave={(v) => updateLead(id, field, v)} />
        );
      }
      if (colType === "checkbox") {
        return (
          <StatusCheckbox
            checked={!!value}
            onChange={(v) => updateLead(id, field, v ? 1 : 0)}
            color={
              field === "website_status" ? "red" :
              field === "responded" ? "blue" :
              field === "followed_up" ? "orange" : "green"
            }
          />
        );
      }
      return (
        <EditableCell
          value={(value as string | number) ?? ""}
          type={colType === "number" ? "number" : "text"}
          onSave={(v) => updateLead(id, field, colType === "number" && v === "" ? null : v)}
        />
      );
    },
    [updateLead]
  );

  const columns = useMemo<ColumnDef<Lead, unknown>[]>(
    () => [
      // Selection checkbox
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className="rounded"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        size: 30,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="rounded"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      }),
      columnHelper.display({
        id: "drag_handle",
        header: "",
        size: 24,
        cell: () => (
          <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex justify-center">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
            </svg>
          </div>
        ),
      }),
      columnHelper.display({
        id: "row_num",
        header: "#",
        size: 35,
        cell: (info) => <span className="text-gray-400 text-xs">{info.row.index + 1}</span>,
      }),
      ...(editableFields.map((field) =>
        columnHelper.accessor(field as keyof Lead, {
          id: field,
          header: ({ column }) => (
            <ColumnHeaderEditor
              columnId={field}
              label={getLabel(field)}
              colType={getColType(field)}
              onSave={saveColConfig}
              onSort={column.getToggleSortingHandler()}
              sortDir={column.getIsSorted()}
            />
          ),
          size:
            field === "business_name" ? 200 : field === "notes" ? 180 :
            field === "email" ? 180 : field === "phone" ? 120 :
            field === "status" ? 110 : field === "follow_up_date" ? 90 :
            field === "demo_site_url" ? 80 :
            ["emailed", "messaged", "responded", "followed_up", "website_status"].includes(field) ? 70 :
            field === "capex" ? 70 : 100,
          cell: (info) => renderCell(info.row.original.id, field, info.getValue(), getColType(field)),
        })
      ) as ColumnDef<Lead, unknown>[]),
      columnHelper.display({
        id: "actions",
        header: "",
        size: 50,
        cell: (info) => (
          <div className="flex gap-0.5 justify-center">
            <button className="p-1 text-gray-400 hover:text-blue-500" title="View details"
              onClick={(e) => { e.stopPropagation(); setSelectedLead(info.row.original); }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button className="p-1 text-gray-400 hover:text-red-500" title="Delete"
              onClick={(e) => { e.stopPropagation(); deleteLead(info.row.original.id); }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ),
      }),
    ],
    [editableFields, getLabel, getColType, saveColConfig, renderCell, deleteLead]
  );

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
  });

  const leadIds = useMemo(() => leads.map((l) => l.id), [leads]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">innov8 CRM</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{leads.length} leads</span>

          {/* Import */}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>

          {/* Export */}
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-40 py-1">
                <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => handleExport("xlsx")}>Export as Excel (.xlsx)</button>
                <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => handleExport("csv")}>Export as CSV</button>
              </div>
            )}
          </div>

          <button onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
            + New Lead
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar />

      {/* Tabs */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Toolbar + Bulk actions */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search leads..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {selectedIds.length > 0 && (
          <div className="relative">
            <button
              className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center gap-1"
              onClick={() => setShowBulkMenu(!showBulkMenu)}
            >
              {selectedIds.length} selected — Bulk actions
            </button>
            {showBulkMenu && (
              <div className="absolute top-full mt-1 left-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-40 py-1">
                <div className="px-3 py-1 text-xs text-gray-400 uppercase">Set stage</div>
                {PIPELINE_STAGES.map((s) => (
                  <button key={s.value} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => bulkAction("update", "status", s.value)}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
                  </button>
                ))}
                <div className="border-t border-gray-100 my-1" />
                <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => bulkAction("update", "emailed", 1)}>Mark as Emailed</button>
                <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => bulkAction("update", "messaged", 1)}>Mark as Messaged</button>
                <button className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => bulkAction("update", "responded", 1)}>Mark as Responded</button>
                <div className="border-t border-gray-100 my-1" />
                <button className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => { if (confirm(`Delete ${selectedIds.length} leads?`)) bulkAction("delete"); }}>
                  Delete selected
                </button>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <button className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100"
            onClick={() => setShowColumnMenu(!showColumnMenu)}>Columns</button>
          {showColumnMenu && (
            <div className="absolute top-full mt-1 right-0 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-40 py-1 max-h-80 overflow-auto">
              {table.getAllLeafColumns()
                .filter((c) => !["row_num", "actions", "drag_handle", "select"].includes(c.id))
                .map((column) => (
                  <label key={column.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />
                    {getLabel(column.id)}
                  </label>
                ))}
            </div>
          )}
        </div>

        <span className="text-xs text-gray-400 hidden lg:inline">Right-click header to rename / change type</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-1 py-2 text-left border-b border-gray-200 select-none"
                      style={{ width: header.getSize() }}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-8 text-gray-400">No leads found</td></tr>
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

      {/* Detail panel */}
      {selectedLead && <EmailLogPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Add New Lead</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Business Name *</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-400 focus:outline-none"
                  value={newLead.business_name}
                  onChange={(e) => { setNewLead((p) => ({ ...p, business_name: e.target.value })); checkDuplicate(e.target.value, newLead.email); }}
                  placeholder="e.g. Smith Plumbing Ltd" autoFocus />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Contact Name</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-400 focus:outline-none"
                  value={newLead.contact_name}
                  onChange={(e) => setNewLead((p) => ({ ...p, contact_name: e.target.value }))}
                  placeholder="e.g. John Smith" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email</label>
                <input className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-400 focus:outline-none"
                  value={newLead.email}
                  onChange={(e) => { setNewLead((p) => ({ ...p, email: e.target.value })); checkDuplicate(newLead.business_name, e.target.value); }}
                  placeholder="e.g. john@smithplumbing.com" />
              </div>
              {duplicateWarning && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
                  ⚠ {duplicateWarning}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800" onClick={() => { setShowAddModal(false); setDuplicateWarning(""); }}>Cancel</button>
              <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700" onClick={addLead}>Add Lead</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2">Import Leads</h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV or Excel file. Columns should include: Business Name, Owner/Contact, Email, Phone, Type, Location, Notes.
              Duplicates (matching business name) will be skipped.
            </p>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImport}
              className="w-full text-sm border border-gray-300 rounded-md p-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-600 file:text-sm" />
            <div className="flex justify-end mt-4">
              <button className="px-4 py-2 text-sm text-gray-600" onClick={() => setShowImportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Click-away overlays */}
      {(showColumnMenu || showExportMenu || showBulkMenu) && (
        <div className="fixed inset-0 z-30" onClick={() => { setShowColumnMenu(false); setShowExportMenu(false); setShowBulkMenu(false); }} />
      )}
    </div>
  );
}
