"use client";

import { useState, useEffect, useRef } from "react";

interface ViewNavProps {
  active: "prospects" | "projects" | "clients";
  onChange: (view: "prospects" | "projects" | "clients") => void;
  projectCount?: number;
  clientCount?: number;
  ownerFilter: string;
  onOwnerChange: (owner: string) => void;
}

const views = [
  { id: "prospects" as const, label: "Prospects", emoji: "📋" },
  { id: "projects" as const, label: "Projects", emoji: "🔨" },
  { id: "clients" as const, label: "Live Clients", emoji: "✅" },
];

export default function ViewNav({ active, onChange, projectCount = 0, clientCount = 0, ownerFilter, onOwnerChange }: ViewNavProps) {
  const [users, setUsers] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users || []));
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showDropdown]);

  const ownerLabel = ownerFilter === "" ? "All" : ownerFilter === "__unassigned__" ? "Unassigned" : ownerFilter;

  return (
    <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ background: "#0a0a0a", borderBottom: "2px solid #1e1e1e" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold text-white flex-shrink-0" style={{ background: "#ea580c" }}>
        i8
      </div>
      <div className="flex items-center gap-2 ml-2">
        {views.map((view) => {
          const isActive = active === view.id;
          const count = view.id === "projects" ? projectCount : view.id === "clients" ? clientCount : 0;
          return (
            <button
              key={view.id}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{
                background: isActive ? "#ea580c" : "#1e1e1e",
                color: isActive ? "#fff" : "#999",
                border: isActive ? "1px solid #ea580c" : "1px solid #333",
                boxShadow: isActive ? "0 0 12px rgba(234,88,12,0.3)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "#252525";
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.borderColor = "#ea580c";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "#1e1e1e";
                  e.currentTarget.style.color = "#999";
                  e.currentTarget.style.borderColor = "#333";
                }
              }}
              onClick={() => onChange(view.id)}
            >
              <span className="text-base">{view.emoji}</span>
              {view.label}
              {count > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                  background: isActive ? "rgba(255,255,255,0.2)" : "#ea580c",
                  color: "#fff",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Owner filter dropdown — pushed to the right */}
      <div className="ml-auto relative" ref={dropdownRef}>
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ background: ownerFilter ? "#ea580c20" : "#1e1e1e", border: `1px solid ${ownerFilter ? "#ea580c" : "#333"}`, color: ownerFilter ? "#ea580c" : "#888" }}
          onClick={() => setShowDropdown(!showDropdown)}
          onMouseEnter={(e) => { if (!ownerFilter) e.currentTarget.style.borderColor = "#ea580c"; }}
          onMouseLeave={(e) => { if (!ownerFilter) e.currentTarget.style.borderColor = "#333"; }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          Owner: {ownerLabel}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showDropdown && (
          <div className="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl z-50 py-1" style={{ background: "#1e1e1e", border: "1px solid #333" }}>
            {[
              { value: "", label: "All" },
              { value: "__unassigned__", label: "Unassigned" },
              ...users.map((u) => ({ value: u, label: u })),
            ].map((opt) => (
              <button key={opt.value}
                className="w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors"
                style={{ color: ownerFilter === opt.value ? "#ea580c" : "#ccc", fontWeight: ownerFilter === opt.value ? 600 : 400 }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#252525"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => { onOwnerChange(opt.value); setShowDropdown(false); }}>
                {opt.label}
                {ownerFilter === opt.value && <span style={{ color: "#ea580c" }}>&#10003;</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
