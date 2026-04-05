"use client";

import { useState, useRef, useEffect } from "react";

interface EditableCellProps {
  value: string | number;
  onSave: (value: string | number) => void;
  type?: "text" | "number";
}

export default function EditableCell({ value, onSave, type = "text" }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);

  const commit = () => {
    setEditing(false);
    const newVal = type === "number" ? (draft === "" ? 0 : Number(draft)) : draft;
    if (newVal !== value) onSave(newVal);
  };

  if (!editing) {
    return (
      <div
        className="px-2 py-1 cursor-pointer min-h-[28px] rounded truncate transition-colors"
        style={{ color: value ? "#f0f0f0" : "#555" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(234,88,12,0.06)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        onDoubleClick={() => setEditing(true)}
        title={String(value ?? "")}
      >
        {value ?? ""}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      className="w-full px-2 py-1 rounded text-sm"
      style={{ background: "#1e1e1e", border: "1px solid #ea580c", color: "#f0f0f0", outline: "none" }}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(String(value ?? "")); setEditing(false); }
      }}
    />
  );
}
