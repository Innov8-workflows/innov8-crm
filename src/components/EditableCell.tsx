"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface EditableCellProps {
  value: string | number;
  onSave: (value: string | number) => void;
  type?: "text" | "number";
}

export default function EditableCell({ value, onSave, type = "text" }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);

  const commit = () => {
    setEditing(false);
    const newVal = type === "number" ? (draft === "" ? 0 : Number(draft)) : draft;
    if (newVal !== value) onSave(newVal);
  };

  const copyToClipboard = useCallback(() => {
    const text = String(value ?? "");
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [value]);

  // Handle paste when cell is focused (not editing)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault();
      copyToClipboard();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        if (text !== undefined) {
          const newVal = type === "number" ? (text === "" ? 0 : Number(text)) : text;
          onSave(newVal);
        }
      });
    }
    // Enter or typing starts editing
    if (e.key === "Enter" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      setEditing(true);
      if (e.key.length === 1) setDraft(e.key);
    }
  }, [copyToClipboard, onSave, type]);

  if (!editing) {
    return (
      <div
        ref={cellRef}
        tabIndex={0}
        className="px-2 py-1 cursor-pointer min-h-[28px] rounded truncate transition-colors relative focus:outline-none"
        style={{ color: value ? "#f0f0f0" : "#555" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(234,88,12,0.06)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        onDoubleClick={() => setEditing(true)}
        onClick={(e) => e.currentTarget.focus()}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          // Right-click copies the cell value
          e.preventDefault();
          copyToClipboard();
        }}
        title={`${String(value ?? "")}\nRight-click or Ctrl+C to copy · Ctrl+V to paste`}
      >
        {value ?? ""}
        {copied && (
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none"
            style={{ background: "#ea580c", color: "#fff", fontSize: 10, zIndex: 20 }}>
            Copied!
          </span>
        )}
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
