"use client";

interface TabBarProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export default function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 px-4 py-1" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      {tabs.map((tab) => (
        <button
          key={tab}
          className="px-4 py-1.5 text-sm font-medium rounded-md transition-all"
          style={{
            background: active === tab ? "rgba(234,88,12,0.15)" : "transparent",
            color: active === tab ? "var(--accent-hover)" : "var(--text-muted)",
            border: active === tab ? "1px solid rgba(234,88,12,0.3)" : "1px solid transparent",
          }}
          onClick={() => onChange(tab)}
          onMouseEnter={(e) => { if (active !== tab) e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={(e) => { if (active !== tab) e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
