"use client";

import { useState, useEffect } from "react";
import LeadGrid from "@/components/LeadGrid";
import KanbanBoard from "@/components/KanbanBoard";
import LiveClients from "@/components/LiveClients";
import ViewNav from "@/components/ViewNav";

export default function Home() {
  const [view, setView] = useState<"prospects" | "projects" | "clients">("prospects");
  const [projectCount, setProjectCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);

  useEffect(() => {
    // Fetch counts for badges once on mount
    fetch("/api/projects?completed=false").then((r) => r.json()).then((d) => setProjectCount(d.projects?.length || 0));
    fetch("/api/projects?completed=true").then((r) => r.json()).then((d) => setClientCount(d.projects?.length || 0));
  }, []);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0f0f0f" }}>
      <ViewNav active={view} onChange={setView} projectCount={projectCount} clientCount={clientCount} />
      {view === "prospects" && <LeadGrid />}
      {view === "projects" && <KanbanBoard />}
      {view === "clients" && <LiveClients />}
    </div>
  );
}
