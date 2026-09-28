"use client";

import type { Project } from "@/types";

// The one or two lines on a client card that say how much is left and what is
// most in the way. Shared by the Projects board and Live Clients so the two
// cards can never tell a different story about the same client.

export const WAITING_LABEL: Record<string, string> = {
  "": "on you",
  client: "waiting on client",
  google: "waiting on Google",
  other: "waiting on someone else",
};

export const WAITING_COLOUR: Record<string, string> = {
  "": "#ea580c",
  client: "#3b82f6",
  google: "#a855f7",
  other: "#6b7280",
};

export default function OutstandingLine({ project, onClick }: {
  project: Pick<Project, "tasks_open" | "task_top">;
  onClick?: () => void;
}) {
  const n = project.tasks_open || 0;
  if (!n) {
    return (
      <div className="text-xs mt-2" style={{ color: "#22c55e" }}>Nothing outstanding</div>
    );
  }
  const top = project.task_top;
  const colour = top?.blocked ? "#6b7280" : WAITING_COLOUR[top?.waiting_on || ""] || "#ea580c";
  const body = (
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{n} outstanding</span>
        {top && top.kind === "task" && (
          <span style={{ color: colour }}>{top.blocked ? "blocked" : WAITING_LABEL[top.waiting_on || ""]}</span>
        )}
      </div>
      {top && (
        <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-dim)" }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: colour }} />
          {top.title}
        </div>
      )}
    </>
  );
  const box = { background: "var(--surface2)", border: "1px solid var(--border)" };
  if (!onClick) return <div className="mt-2 rounded-md px-2 py-1.5" style={box}>{body}</div>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      className="block w-full text-left mt-2 rounded-md px-2 py-1.5"
      style={{ ...box, cursor: "pointer" }}
      title="Open what's outstanding"
    >
      {body}
    </button>
  );
}
