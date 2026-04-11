"use client";

import { useState, useEffect, useRef } from "react";

type ViewId = "prospects" | "projects" | "clients" | "dashboard" | "pricing";

interface ViewNavProps {
  active: ViewId;
  onChange: (view: ViewId) => void;
  projectCount?: number;
  clientCount?: number;
  ownerFilter: string;
  onOwnerChange: (owner: string) => void;
}

const views = [
  { id: "prospects" as const, label: "Prospects", emoji: "📋" },
  { id: "projects" as const, label: "Projects", emoji: "🔨" },
  { id: "clients" as const, label: "Live Clients", emoji: "✅" },
  { id: "dashboard" as const, label: "Dashboard", emoji: "📊" },
  { id: "pricing" as const, label: "Pricing", emoji: "💷" },
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
  const ownerBtnColor = ownerFilter === "Truthfu1" ? "var(--accent)" : ownerFilter === "LowKey" ? "#c084fc" : ownerFilter ? "var(--accent)" : "";

  return (
    <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ background: "var(--nav-bg)", borderBottom: "2px solid var(--surface2)" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold text-white flex-shrink-0" style={{ background: "var(--accent)" }}>
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
                background: isActive ? "var(--accent)" : "var(--surface2)",
                color: isActive ? "#fff" : "var(--text-secondary)",
                border: isActive ? "1px solid var(--accent)" : "1px solid var(--border-light)",
                boxShadow: isActive ? "0 0 12px rgba(234,88,12,0.3)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--surface3)";
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.borderColor = "var(--accent)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--surface2)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.borderColor = "var(--border-light)";
                }
              }}
              onClick={() => onChange(view.id)}
            >
              <span className="text-base">{view.emoji}</span>
              {view.label}
              {count > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                  background: isActive ? "rgba(255,255,255,0.2)" : "var(--accent)",
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
          style={{ background: ownerBtnColor ? `${ownerBtnColor}20` : "var(--surface2)", border: `1px solid ${ownerBtnColor || "var(--border-light)"}`, color: ownerBtnColor || "var(--text-muted)" }}
          onClick={() => setShowDropdown(!showDropdown)}
          onMouseEnter={(e) => { if (!ownerFilter) e.currentTarget.style.borderColor = "var(--accent)"; }}
          onMouseLeave={(e) => { if (!ownerFilter) e.currentTarget.style.borderColor = "var(--border-light)"; }}
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
          <div className="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl z-50 py-1" style={{ background: "var(--surface2)", border: "1px solid var(--border-light)" }}>
            {[
              { value: "", label: "All", color: "" },
              { value: "__unassigned__", label: "Unassigned", color: "" },
              ...users.map((u) => ({ value: u, label: u, color: u === "Truthfu1" ? "var(--accent)" : u === "LowKey" ? "#c084fc" : "" })),
            ].map((opt) => {
              const isActive = ownerFilter === opt.value;
              const textColor = isActive ? (opt.color || "var(--accent)") : opt.color || "var(--text-secondary)";
              return (
                <button key={opt.value}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors"
                  style={{ color: textColor, fontWeight: isActive ? 600 : opt.color ? 500 : 400 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface3)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  onClick={() => { onOwnerChange(opt.value); setShowDropdown(false); }}>
                  {opt.label}
                  {isActive && <span style={{ color: textColor }}>&#10003;</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Theme toggle */}
      <button
        className="p-2 rounded-lg transition-colors"
        style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-muted)" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        onClick={() => {
          const themes = ["dark", "light", "midnight"] as const;
          const current = localStorage.getItem("crm_theme") || "dark";
          const idx = themes.indexOf(current as typeof themes[number]);
          const next = themes[(idx + 1) % themes.length];
          localStorage.setItem("crm_theme", next);
          document.documentElement.className = document.documentElement.className
            .replace(/theme-\w+/g, "").trim() + (next !== "dark" ? ` theme-${next}` : "");
        }}
        title="Toggle theme (Dark / Light / Midnight)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
        </svg>
      </button>
    </div>
  );
}
