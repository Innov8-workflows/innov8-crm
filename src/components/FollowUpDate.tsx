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
      <input
        type="date"
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
        value={value || ""}
        autoFocus
        onChange={(e) => { onChange(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
      />
    );
  }

  if (!value) {
    return (
      <button
        className="text-gray-300 hover:text-gray-500 text-xs px-1 py-0.5"
        onClick={() => setEditing(true)}
      >
        Set date
      </button>
    );
  }

  const formatted = new Date(value + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });

  return (
    <button
      className={`px-1.5 py-0.5 rounded text-xs font-medium ${
        isOverdue ? "bg-red-100 text-red-700" :
        isToday ? "bg-amber-100 text-amber-700" :
        "bg-gray-100 text-gray-600"
      }`}
      onClick={() => setEditing(true)}
      title={value}
    >
      {isOverdue ? "⚠ " : ""}{formatted}
    </button>
  );
}
