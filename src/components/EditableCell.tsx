"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface EditableCellProps {
  value: string | number;
  onSave: (value: string | number) => void;
  type?: "text" | "number";
}

function copyText(text: string): Promise<void> {
  // Try clipboard API first, fall back to execCommand
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy(text);
    });
  }
  fallbackCopy(text);
  return Promise.resolve();
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function pasteText(): Promise<string> {
  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  return Promise.resolve("");
}

export default function EditableCell({ value, onSave, type = "text" }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);

  const commit = () => {
    setEditing(false);
    const newVal = type === "number" ? (draft === "" ? 0 : Number(draft)) : draft;
    if (newVal !== value) onSave(newVal);
  };

  const doCopy = useCallback(() => {
    const text = String(value ?? "");
    if (!text) return;
    copyText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [value]);

  const doPaste = useCallback(() => {
    pasteText().then((text) => {
      if (text) {
        const newVal = type === "number" ? (text === "" ? 0 : Number(text)) : text;
        onSave(newVal);
      }
    });
  }, [onSave, type]);

  // Handle keyboard shortcuts when cell is focused (not editing)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault();
      doCopy();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault();
      doPaste();
    }
    if (e.key === "Enter" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      setEditing(true);
      if (e.key.length === 1) setDraft(e.key);
    }
  }, [doCopy, doPaste]);

  if (!editing) {
    return (
      <div
        tabIndex={0}
        className="px-2 py-1 cursor-pointer min-h-[28px] rounded truncate transition-colors focus:outline-none"
        style={{ color: value ? "#f0f0f0" : "#555", position: "relative" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(234,88,12,0.06)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        onDoubleClick={() => setEditing(true)}
        onClick={(e) => e.currentTarget.focus()}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          doCopy();
        }}
        title={String(value ?? "")}
      >
        {value ?? ""}
        {copied && (
          <span style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#ea580c",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 8,
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}>
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
