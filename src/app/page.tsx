"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import ViewNav from "@/components/ViewNav";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";
import LoadingAI from "@/components/LoadingAI";

// Lazy load heavy view components — only loaded when tab is clicked
const LeadGrid = lazy(() => import("@/components/LeadGrid"));
const KanbanBoard = lazy(() => import("@/components/KanbanBoard"));
const LiveClients = lazy(() => import("@/components/LiveClients"));
const Dashboard = lazy(() => import("@/components/Dashboard"));
const Pricing = lazy(() => import("@/components/Pricing"));

export default function Home() {
  const [view, setView] = useState<"prospects" | "projects" | "clients" | "dashboard" | "pricing">("prospects");
  const [projectCount, setProjectCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("crm_ownerFilter") || "";
    }
    return "";
  });

  // Lightweight count fetch — uses fast stats API instead of loading all projects
  useEffect(() => {
    fetch("/api/clients/stats").then((r) => r.json()).then((d) => {
      setClientCount(d.clientCount || 0);
    });
    fetch("/api/projects?completed=false").then((r) => r.json()).then((d) => {
      setProjectCount(d.projects?.length || 0);
    });
  }, []);

  const handleOwnerChange = (owner: string) => {
    setOwnerFilter(owner);
    try { localStorage.setItem("crm_ownerFilter", owner); } catch {}
  };

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen" style={{ background: "var(--bg)" }}>
        <ViewNav active={view} onChange={setView} projectCount={projectCount} clientCount={clientCount}
          ownerFilter={ownerFilter} onOwnerChange={handleOwnerChange} />
        <Suspense fallback={<LoadingAI message="Loading" />}>
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
          <ErrorBoundary fallbackMessage="Pricing failed to load">
            {view === "pricing" && <Pricing />}
          </ErrorBoundary>
        </Suspense>
      </div>
    </ToastProvider>
  );
}
