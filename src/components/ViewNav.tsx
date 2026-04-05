"use client";

interface ViewNavProps {
  active: "prospects" | "projects" | "clients";
  onChange: (view: "prospects" | "projects" | "clients") => void;
  projectCount?: number;
  clientCount?: number;
}

const views = [
  { id: "prospects" as const, label: "Prospects", emoji: "📋" },
  { id: "projects" as const, label: "Projects", emoji: "🔨" },
  { id: "clients" as const, label: "Live Clients", emoji: "✅" },
];

export default function ViewNav({ active, onChange, projectCount = 0, clientCount = 0 }: ViewNavProps) {
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
    </div>
  );
}
