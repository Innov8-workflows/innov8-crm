"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
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
const Referrals = lazy(() => import("@/components/Referrals"));
const MapView = lazy(() => import("@/components/MapView"));
const AISolutions = lazy(() => import("@/components/AISolutions"));

export default function Home() {
  const [view, setView] = useState<"prospects" | "projects" | "clients" | "dashboard" | "map" | "ai_solutions" | "pricing" | "referrals">("prospects");
  const [projectCount, setProjectCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("crm_ownerFilter") || "";
    }
    return "";
  });

  // Lightweight count fetch — uses fast stats API instead of loading all projects
  const refreshCounts = useCallback(() => {
    fetch("/api/clients/stats").then((r) => r.json()).then((d) => {
      setClientCount(d.clientCount || 0);
    });
    fetch("/api/projects?completed=false").then((r) => r.json()).then((d) => {
      setProjectCount(d.projects?.length || 0);
    });
  }, []);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  // Re-fetch counts whenever the user navigates back to a count-bearing view
  // (catches deletions/additions made in other views without a full refresh)
  useEffect(() => {
    if (view === "projects" || view === "clients" || view === "dashboard") {
      refreshCounts();
    }
  }, [view, refreshCounts]);

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
            {view === "projects" && <KanbanBoard ownerFilter={ownerFilter} onCountsChanged={refreshCounts} />}
          </ErrorBoundary>
          <ErrorBoundary fallbackMessage="Clients failed to load">
            {view === "clients" && <LiveClients ownerFilter={ownerFilter} onCountsChanged={refreshCounts} />}
          </ErrorBoundary>
          <ErrorBoundary fallbackMessage="Dashboard failed to load">
            {view === "dashboard" && <Dashboard ownerFilter={ownerFilter} />}
          </ErrorBoundary>
          <ErrorBoundary fallbackMessage="Map failed to load">
            {view === "map" && <MapView ownerFilter={ownerFilter} />}
          </ErrorBoundary>
          <ErrorBoundary fallbackMessage="AI Solutions failed to load">
            {view === "ai_solutions" && <AISolutions />}
          </ErrorBoundary>
          <ErrorBoundary fallbackMessage="Pricing failed to load">
            {view === "pricing" && <Pricing />}
          </ErrorBoundary>
          <ErrorBoundary fallbackMessage="Referrals failed to load">
            {view === "referrals" && <Referrals />}
          </ErrorBoundary>
        </Suspense>
      </div>
    </ToastProvider>
  );
}
