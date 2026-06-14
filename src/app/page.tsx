"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import ViewNav from "@/components/ViewNav";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";
import LoadingAI from "@/components/LoadingAI";

// Lazy load heavy view components — only loaded when tab is first visited
const LeadGrid = lazy(() => import("@/components/LeadGrid"));
const KanbanBoard = lazy(() => import("@/components/KanbanBoard"));
const LiveClients = lazy(() => import("@/components/LiveClients"));
const Dashboard = lazy(() => import("@/components/Dashboard"));
const Pricing = lazy(() => import("@/components/Pricing"));
const Referrals = lazy(() => import("@/components/Referrals"));
const MapView = lazy(() => import("@/components/MapView"));
const AISolutions = lazy(() => import("@/components/AISolutions"));
const Schedule = lazy(() => import("@/components/Schedule"));
const Todos = lazy(() => import("@/components/Todos"));

type ViewId = "prospects" | "projects" | "clients" | "dashboard" | "map" | "ai_solutions" | "schedule" | "todos" | "pricing" | "referrals";

export default function Home() {
  const [view, setView] = useState<ViewId>("prospects");
  const [projectCount, setProjectCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [todoCount, setTodoCount] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("crm_ownerFilter") || "";
    }
    return "";
  });

  // Track which views have been visited at least once. Heavy views (LeadGrid,
  // KanbanBoard, LiveClients) mount on first visit and stay mounted-but-hidden
  // afterwards, so switching tabs no longer triggers a full unmount → remount →
  // re-fetch cycle. Trade memory for snappy navigation — single-user CRM, fine.
  const visitedRef = useRef<Set<ViewId>>(new Set([view]));
  const [, forceRerender] = useState(0);
  useEffect(() => {
    if (!visitedRef.current.has(view)) {
      visitedRef.current.add(view);
      forceRerender((n) => n + 1);
    }
  }, [view]);

  // Lightweight count fetch — uses fast stats API instead of loading all projects
  const refreshCounts = useCallback(() => {
    fetch("/api/clients/stats").then((r) => r.json()).then((d) => {
      setClientCount(d.clientCount || 0);
    });
    fetch("/api/projects?completed=false").then((r) => r.json()).then((d) => {
      setProjectCount(d.projects?.length || 0);
    });
    fetch("/api/todos?count=1").then((r) => r.json()).then((d) => {
      setTodoCount(d.count || 0);
    }).catch(() => {});
  }, []);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  // Re-fetch counts whenever the user navigates back to a count-bearing view
  useEffect(() => {
    if (view === "projects" || view === "clients" || view === "dashboard" || view === "todos") {
      refreshCounts();
    }
  }, [view, refreshCounts]);

  const handleOwnerChange = (owner: string) => {
    setOwnerFilter(owner);
    try { localStorage.setItem("crm_ownerFilter", owner); } catch {}
  };

  // Helper: render a view container that mounts on first visit, then stays
  // mounted but hidden. Avoids the costly unmount/remount/re-fetch cycle.
  const persistedView = (id: ViewId, fallbackMessage: string, render: () => React.ReactNode) => {
    const isVisited = visitedRef.current.has(id);
    if (!isVisited) return null;
    return (
      <div className="flex-1 flex flex-col min-h-0" style={{ display: view === id ? "flex" : "none" }}>
        <ErrorBoundary fallbackMessage={fallbackMessage}>{render()}</ErrorBoundary>
      </div>
    );
  };

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen" style={{ background: "var(--bg)" }}>
        <ViewNav active={view} onChange={setView} projectCount={projectCount} clientCount={clientCount} todoCount={todoCount}
          ownerFilter={ownerFilter} onOwnerChange={handleOwnerChange} />
        <Suspense fallback={<LoadingAI message="Loading" />}>
          {persistedView("prospects",    "Prospects failed to load",    () => <LeadGrid ownerFilter={ownerFilter} />)}
          {persistedView("projects",     "Projects failed to load",     () => <KanbanBoard ownerFilter={ownerFilter} onCountsChanged={refreshCounts} />)}
          {persistedView("clients",      "Clients failed to load",      () => <LiveClients ownerFilter={ownerFilter} onCountsChanged={refreshCounts} />)}
          {persistedView("dashboard",    "Dashboard failed to load",    () => <Dashboard ownerFilter={ownerFilter} active={view === "dashboard"} />)}
          {persistedView("map",          "Map failed to load",          () => <MapView ownerFilter={ownerFilter} />)}
          {persistedView("ai_solutions", "AI Solutions failed to load", () => <AISolutions />)}
          {persistedView("schedule",     "Schedule failed to load",     () => <Schedule />)}
          {persistedView("todos",        "To-Do failed to load",        () => <Todos ownerFilter={ownerFilter} onCountChanged={setTodoCount} />)}
          {persistedView("pricing",      "Pricing failed to load",      () => <Pricing />)}
          {persistedView("referrals",    "Referrals failed to load",    () => <Referrals />)}
        </Suspense>
      </div>
    </ToastProvider>
  );
}
