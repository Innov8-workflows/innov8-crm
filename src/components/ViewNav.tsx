"use client";

interface ViewNavProps {
  active: "prospects" | "projects" | "clients";
  onChange: (view: "prospects" | "projects" | "clients") => void;
  projectCount?: number;
  clientCount?: number;
}

const views = [
  { id: "prospects" as const, label: "Prospects", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
  { id: "projects" as const, label: "Projects", icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" },
  { id: "clients" as const, label: "Live Clients", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
];

export default function ViewNav({ active, onChange, projectCount = 0, clientCount = 0 }: ViewNavProps) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 flex-shrink-0" style={{ background: "#0a0a0a", borderBottom: "1px solid #1e1e1e" }}>
      <div className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-xs font-medium text-white flex-shrink-0" style={{ background: "#ea580c" }}>
        i8
      </div>
      <div className="flex items-center gap-1 ml-2">
        {views.map((view) => {
          const isActive = active === view.id;
          const count = view.id === "projects" ? projectCount : view.id === "clients" ? clientCount : 0;
          return (
            <button
              key={view.id}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: isActive ? "rgba(234,88,12,0.15)" : "transparent",
                color: isActive ? "#f97316" : "#555",
                border: isActive ? "1px solid rgba(234,88,12,0.3)" : "1px solid transparent",
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = "#aaa"; e.currentTarget.style.background = "#161616"; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = "#555"; e.currentTarget.style.background = "transparent"; } }}
              onClick={() => onChange(view.id)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={view.icon} />
              </svg>
              {view.label}
              {count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{
                  background: isActive ? "rgba(234,88,12,0.25)" : "#252525",
                  color: isActive ? "#f97316" : "#888",
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
