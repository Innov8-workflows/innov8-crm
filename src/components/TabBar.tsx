"use client";

interface TabBarProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export default function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 px-4 py-1" style={{ background: "#161616", borderBottom: "1px solid #2a2a2a" }}>
      {tabs.map((tab) => (
        <button
          key={tab}
          className="px-4 py-1.5 text-sm font-medium rounded-md transition-all"
          style={{
            background: active === tab ? "rgba(234,88,12,0.15)" : "transparent",
            color: active === tab ? "#f97316" : "#888",
            border: active === tab ? "1px solid rgba(234,88,12,0.3)" : "1px solid transparent",
          }}
          onClick={() => onChange(tab)}
          onMouseEnter={(e) => { if (active !== tab) e.currentTarget.style.color = "#ccc"; }}
          onMouseLeave={(e) => { if (active !== tab) e.currentTarget.style.color = "#888"; }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
