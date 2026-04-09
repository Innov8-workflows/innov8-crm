"use client";

import { useState, useEffect } from "react";
import LeadGrid from "@/components/LeadGrid";
import KanbanBoard from "@/components/KanbanBoard";
import LiveClients from "@/components/LiveClients";
import Dashboard from "@/components/Dashboard";
import ViewNav from "@/components/ViewNav";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";

export default function Home() {
  const [view, setView] = useState<"prospects" | "projects" | "clients" | "dashboard">("prospects");
  const [projectCount, setProjectCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("crm_ownerFilter") || "";
    }
    return "";
  });

  useEffect(() => {
    fetch("/api/projects?completed=false").then((r) => r.json()).then((d) => setProjectCount(d.projects?.length || 0));
    fetch("/api/projects?completed=true").then((r) => r.json()).then((d) => setClientCount(d.projects?.length || 0));
  }, []);

  const handleOwnerChange = (owner: string) => {
    setOwnerFilter(owner);
    try { localStorage.setItem("crm_ownerFilter", owner); } catch {}
  };

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen" style={{ background: "#0f0f0f" }}>
        <ViewNav active={view} onChange={setView} projectCount={projectCount} clientCount={clientCount}
          ownerFilter={ownerFilter} onOwnerChange={handleOwnerChange} />
        <ErrorBoundary fallbackMessage="Prospects failed to load">
          {view === "prospects" && <LeadGrid ownerFilter={ownerFilter} />}
        </ErrorBoundary>
        <ErrorBoundary fallbackMessage="Projects failed to load">
          {view === "projects" && <KanbanBoard ownerFilter={ownerFilter} />}
        </ErrorBoundary>
        <ErrorBoundary fallbackMessage="Clients failed to load">
          {view === "clients" && <LiveClients ownerFilter={ownerFilter} />}
        </ErrorBoundary>
        <ErrorBoundary fallbackMessage="Dashboard failed to load">
          {view === "dashboard" && <Dashboard ownerFilter={ownerFilter} />}
        </ErrorBoundary>
      </div>
    </ToastProvider>
  );
}
