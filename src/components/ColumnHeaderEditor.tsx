"use client";

import { useState, useRef, useEffect } from "react";

interface ColumnHeaderEditorProps {
  columnId: string;
  label: string;
  colType: string;
  onSave: (columnId: string, label: string, colType: string) => void;
  onSort?: ((event: unknown) => void) | undefined;
  sortDir?: false | "asc" | "desc";
}

const COL_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
];

export default function ColumnHeaderEditor({ columnId, label, colType, onSave, onSort, sortDir }: ColumnHeaderEditorProps) {
  const [editing, setEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftType, setDraftType] = useState(colType);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraftLabel(label); setDraftType(colType); }, [label, colType]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const commit = () => {
    setEditing(false);
    if (draftLabel !== label || draftType !== colType) onSave(columnId, draftLabel, draftType);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1 cursor-pointer select-none"
        onClick={onSort}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}>
        {editing ? (
          <input ref={inputRef}
            className="text-xs font-semibold uppercase tracking-wider rounded px-1 py-0.5 w-full"
            style={{ background: "#1e1e1e", border: "1px solid #ea580c", color: "#f0f0f0", outline: "none" }}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraftLabel(label); setEditing(false); }
            }}
          />
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
            {label}
          </span>
        )}
        {sortDir === "asc" && <span style={{ color: "#ea580c" }}> ↑</span>}
        {sortDir === "desc" && <span style={{ color: "#ea580c" }}> ↓</span>}
      </div>

      {showMenu && (
        <div ref={menuRef}
          className="absolute top-full left-0 mt-1 w-52 rounded-lg shadow-xl z-50 py-1"
          style={{ background: "#1e1e1e", border: "1px solid #333" }}
          onClick={(e) => e.stopPropagation()}>
          <button className="w-full text-left px-3 py-1.5 text-sm transition-colors"
            style={{ color: "#ccc" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#252525"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            onClick={() => { setShowMenu(false); setEditing(true); }}>
            Rename column
          </button>
          <div style={{ borderTop: "1px solid #2a2a2a", margin: "4px 0" }} />
          <div className="px-3 py-1 text-xs uppercase" style={{ color: "#555" }}>Column type</div>
          {COL_TYPES.map((t) => (
            <button key={t.value}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors"
              style={{ color: draftType === t.value ? "#ea580c" : "#ccc", fontWeight: draftType === t.value ? 600 : 400 }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#252525"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              onClick={() => { setDraftType(t.value); onSave(columnId, draftLabel, t.value); setShowMenu(false); }}>
              {t.label}
              {draftType === t.value && <span style={{ color: "#ea580c" }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
