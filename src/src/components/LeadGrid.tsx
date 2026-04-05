"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
} from "@tanstack/react-table";
import type { Lead } from "@/types";
import EditableCell from "./EditableCell";
import StatusCheckbox from "./StatusCheckbox";
import TabBar from "./TabBar";
import EmailLogPanel from "./EmailLogPanel";

const TABS = ["All", "Plumbing", "Electrician", "Driveway", "Other"];

const columnHelper = createColumnHelper<Lead>();

export default function LeadGrid() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newBizName, setNewBizName] = useState("");

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeTab !== "All") params.set("business_type", activeTab);
    if (search) params.set("search", search);

    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads || []);
    setLoading(false);
  }, [activeTab, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const updateLead = useCallback(
    async (id: number, field: string, value: string | number | null) => {
      // Optimistic update
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
      );
      await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    },
    []
  );

  const addLead = useCallback(async () => {
    if (!newBizName.trim()) return;
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: newBizName.trim(),
        business_type: activeTab !== "All" ? activeTab : "",
      }),
    });
    const lead = await res.json();
    setLeads((prev) => [...prev, lead]);
    setNewBizName("");
    setShowAddRow(false);
  }, [newBizName, activeTab]);

  const deleteLead = useCallback(async (id: number) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }, []);

  const columns = useMemo<ColumnDef<Lead, unknown>[]>(
    () => [
      columnHelper.display({
        id: "row_num",
        header: "#",
        size: 40,
        cell: (info) => (
          <span className="text-gray-400 text-xs">{info.row.index + 1}</span>
        ),
      }),
      columnHelper.accessor("business_name", {
        header: "Business",
        size: 220,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            onSave={(v) => updateLead(info.row.original.id, "business_name", v)}
          />
        ),
      }),
      columnHelper.accessor("contact_name", {
        header: "Owner",
        size: 120,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            onSave={(v) => updateLead(info.row.original.id, "contact_name", v)}
          />
        ),
      }),
      columnHelper.accessor("business_type", {
        header: "Business Type",
        size: 120,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            onSave={(v) => updateLead(info.row.original.id, "business_type", v)}
          />
        ),
      }),
      columnHelper.accessor("location", {
        header: "Location",
        size: 120,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            onSave={(v) => updateLead(info.row.original.id, "location", v)}
          />
        ),
      }),
      columnHelper.accessor("website_status", {
        header: "Website?",
        size: 80,
        cell: (info) => (
          <StatusCheckbox
            checked={!!info.getValue()}
            onChange={(v) => updateLead(info.row.original.id, "website_status", v ? 1 : 0)}
            color="red"
          />
        ),
      }),
      columnHelper.accessor("email", {
        header: "Email",
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            onSave={(v) => updateLead(info.row.original.id, "email", v)}
          />
        ),
      }),
      columnHelper.accessor("phone", {
        header: "Number",
        size: 130,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            onSave={(v) => updateLead(info.row.original.id, "phone", v)}
          />
        ),
      }),
      columnHelper.accessor("emailed", {
        header: "Emailed",
        size: 70,
        cell: (info) => (
          <StatusCheckbox
            checked={!!info.getValue()}
            onChange={(v) => updateLead(info.row.original.id, "emailed", v ? 1 : 0)}
            color="green"
          />
        ),
      }),
      columnHelper.accessor("messaged", {
        header: "Messaged",
        size: 80,
        cell: (info) => (
          <StatusCheckbox
            checked={!!info.getValue()}
            onChange={(v) => updateLead(info.row.original.id, "messaged", v ? 1 : 0)}
            color="green"
          />
        ),
      }),
      columnHelper.accessor("responded", {
        header: "Responded",
        size: 85,
        cell: (info) => (
          <StatusCheckbox
            checked={!!info.getValue()}
            onChange={(v) => updateLead(info.row.original.id, "responded", v ? 1 : 0)}
            color="blue"
          />
        ),
      }),
      columnHelper.accessor("followed_up", {
        header: "Followed Up",
        size: 90,
        cell: (info) => (
          <StatusCheckbox
            checked={!!info.getValue()}
            onChange={(v) => updateLead(info.row.original.id, "followed_up", v ? 1 : 0)}
            color="orange"
          />
        ),
      }),
      columnHelper.accessor("capex", {
        header: "CAPEX",
        size: 80,
        cell: (info) => (
          <EditableCell
            value={info.getValue() ?? ""}
            type="number"
            onSave={(v) => updateLead(info.row.original.id, "capex", v === "" ? null : Number(v))}
          />
        ),
      }),
      columnHelper.accessor("notes", {
        header: "Notes",
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            onSave={(v) => updateLead(info.row.original.id, "notes", v)}
          />
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        size: 60,
        cell: (info) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-1 text-gray-400 hover:text-blue-500"
              title="View emails"
              onClick={(e) => { e.stopPropagation(); setSelectedLead(info.row.original); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              className="p-1 text-gray-400 hover:text-red-500"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); deleteLead(info.row.original.id); }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ),
      }),
    ],
    [updateLead, deleteLead]
  );

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">innov8 CRM</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{leads.length} leads</span>
          <button
            onClick={() => setShowAddRow(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            + New Lead
          </button>
        </div>
      </div>

      {/* Tabs */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search leads..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <button
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100"
            onClick={() => setShowColumnMenu(!showColumnMenu)}
          >
            Columns
          </button>
          {showColumnMenu && (
            <div className="absolute top-full mt-1 right-0 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-40 py-1">
              {table.getAllLeafColumns().filter(c => c.id !== "row_num" && c.id !== "actions").map((column) => (
                <label
                  key={column.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                  />
                  {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 select-none"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className="flex items-center gap-1 cursor-pointer">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? " ↑" : ""}
                      {header.column.getIsSorted() === "desc" ? " ↓" : ""}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-gray-400">
                  No leads found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-1 py-0.5" style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}

            {/* Add new row */}
            {showAddRow && (
              <tr className="border-b border-blue-200 bg-blue-50">
                <td className="px-2 py-1 text-gray-400 text-xs">+</td>
                <td className="px-1 py-1" colSpan={columns.length - 1}>
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded"
                      placeholder="Business name..."
                      value={newBizName}
                      onChange={(e) => setNewBizName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addLead();
                        if (e.key === "Escape") { setShowAddRow(false); setNewBizName(""); }
                      }}
                    />
                    <button
                      onClick={addLead}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAddRow(false); setNewBizName(""); }}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Email Log Panel */}
      {selectedLead && (
        <EmailLogPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}

      {/* Click-away for column menu */}
      {showColumnMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowColumnMenu(false)} />
      )}
    </div>
  );
}
