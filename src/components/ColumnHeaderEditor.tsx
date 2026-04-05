"use client";

import { useState, useRef, useEffect } from "react";

interface ColumnHeaderEditorProps {
  columnId: string;
  label: string;
  colType: string;
  onSave: (columnId: string, label: string, colType: string) => void;
  onSort?: () => void;
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

export default function ColumnHeaderEditor({
  columnId,
  label,
  colType,
  onSave,
  onSort,
  sortDir,
}: ColumnHeaderEditorProps) {
  const [editing, setEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftType, setDraftType] = useState(colType);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    setDraftLabel(label);
    setDraftType(colType);
  }, [label, colType]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const commit = () => {
    setEditing(false);
    if (draftLabel !== label || draftType !== colType) {
      onSave(columnId, draftLabel, draftType);
    }
  };

  return (
    <div className="relative">
      <div
        className="flex items-center gap-1 cursor-pointer select-none"
        onClick={onSort}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowMenu(true);
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="text-xs font-medium uppercase tracking-wider bg-white border border-blue-400 rounded px-1 py-0.5 outline-none w-full"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraftLabel(label);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {label}
          </span>
        )}
        {sortDir === "asc" && " ↑"}
        {sortDir === "desc" && " ↓"}
      </div>

      {showMenu && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={() => {
              setShowMenu(false);
              setEditing(true);
            }}
          >
            Rename column
          </button>
          <div className="border-t border-gray-100 my-1" />
          <div className="px-3 py-1 text-xs text-gray-400 uppercase">Column type</div>
          {COL_TYPES.map((t) => (
            <button
              key={t.value}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${
                draftType === t.value ? "text-blue-600 font-medium" : ""
              }`}
              onClick={() => {
                setDraftType(t.value);
                onSave(columnId, draftLabel, t.value);
                setShowMenu(false);
              }}
            >
              {t.label}
              {draftType === t.value && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
