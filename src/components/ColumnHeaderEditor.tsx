"use client";

import { useState, useRef, useEffect } from "react";

interface ColumnHeaderEditorProps {
  columnId: string;
  label: string;
  colType: string;
  onSave: (columnId: string, label: string, colType: string) => void;
  onSort?: ((event: unknown) => void) | undefined;
  sortDir?: false | "asc" | "desc";
  onDelete?: (columnId: string) => void;
}

const COL_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
];

export default function ColumnHeaderEditor({ columnId, label, colType, onSave, onSort, sortDir, onDelete }: ColumnHeaderEditorProps) {
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
          {onDelete && (
            <>
              <div style={{ borderTop: "1px solid #2a2a2a", margin: "4px 0" }} />
              <button className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors"
                style={{ color: "#ef4444" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#ef444415"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => { setShowMenu(false); onDelete(columnId); }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete column
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
