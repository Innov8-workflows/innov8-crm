"use client";

import { useState } from "react";

interface FollowUpDateProps {
  value: string;
  onChange: (value: string) => void;
}

export default function FollowUpDate({ value, onChange }: FollowUpDateProps) {
  const [editing, setEditing] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = value && value < today;
  const isToday = value === today;

  if (editing) {
    return (
      <input type="date" autoFocus
        className="w-full px-1 py-0.5 text-xs rounded"
        style={{ background: "var(--surface2)", border: "1px solid var(--accent)", color: "var(--text)", outline: "none", colorScheme: "dark" }}
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  if (!value) {
    return (
      <button className="text-xs px-1 py-0.5 transition-colors" style={{ color: "var(--text-quaternary)" }}
        onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-muted)"}
        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-quaternary)"}
        onClick={() => setEditing(true)}>
        Set date
      </button>
    );
  }

  const formatted = new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <button className="px-1.5 py-0.5 rounded text-xs font-medium"
      style={{
        background: isOverdue ? "rgba(239,68,68,0.15)" : isToday ? "rgba(234,179,8,0.15)" : "rgba(255,255,255,0.05)",
        color: isOverdue ? "#ef4444" : isToday ? "#eab308" : "var(--text-muted)",
        border: `1px solid ${isOverdue ? "rgba(239,68,68,0.2)" : isToday ? "rgba(234,179,8,0.2)" : "transparent"}`,
      }}
      onClick={() => setEditing(true)} title={value}>
      {isOverdue ? "! " : ""}{formatted}
    </button>
  );
}
