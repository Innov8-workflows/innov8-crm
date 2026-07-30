"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { fetchBootstrap, getCachedBootstrap, prefetchLeads } from "@/lib/bootstrap";
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
const ClientDashboard = lazy(() => import("@/components/ClientDashboard"));

type ViewId = "prospects" | "projects" | "clients" | "client_dash" | "dashboard" | "map" | "ai_solutions" | "schedule" | "todos" | "pricing" | "referrals";

// Fire the two critical-path requests at module-evaluation time — before React
// hydrates, renders, or the lazy LeadGrid chunk arrives. By the time the grid
// mounts, both responses are usually already in flight or landed. Also warm the
// LeadGrid chunk itself (same module promise React.lazy will reuse) since
// Prospects is always the first view shown.
if (typeof window !== "undefined") {
  const owner = localStorage.getItem("crm_ownerFilter") || "";
  fetchBootstrap(owner).catch(() => {});
  prefetchLeads(owner);
  void import("@/components/LeadGrid");
}

export default function Home() {
  const [view, setView] = useState<ViewId>("prospects");
  const [ownerFilter, setOwnerFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("crm_ownerFilter") || "";
    }
    return "";
  });
  // Nav badges paint instantly from the session-cached bootstrap; the live
  // response (fetched in the effect below) replaces them.
  const [cachedCounts] = useState(() =>
    typeof window === "undefined" ? null : getCachedBootstrap(localStorage.getItem("crm_ownerFilter") || "")?.counts || null);
  const [dashClientId, setDashClientId] = useState<number | null>(null);
  const [projectCount, setProjectCount] = useState(cachedCounts?.projects || 0);
  const [clientCount, setClientCount] = useState(cachedCounts?.clients || 0);
  const [todoCount, setTodoCount] = useState(cachedCounts?.todos || 0);

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
    fetch("/api/projects?completed=false&count=1").then((r) => r.json()).then((d) => {
      setProjectCount(d.count || 0);
    }).catch(() => {});
    fetch("/api/todos?count=1").then((r) => r.json()).then((d) => {
      setTodoCount(d.count || 0);
    }).catch(() => {});
  }, []);

  // Initial nav-badge counts ride along on the ONE /api/bootstrap request (shared
  // with ViewNav/LeadGrid/StatsBar) instead of three separate fetches. They're kept
  // fresh afterwards by each view reporting changes up via onCountsChanged /
  // onCountChanged, which still hit the individual count endpoints.
  useEffect(() => {
    fetchBootstrap(ownerFilter).then((b) => {
      setClientCount(b.counts.clients || 0);
      setProjectCount(b.counts.projects || 0);
      setTodoCount(b.counts.todos || 0);
    }).catch(() => refreshCounts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOwnerChange = (owner: string) => {
    setOwnerFilter(owner);
    try { localStorage.setItem("crm_ownerFilter", owner); } catch {}
  };

  // Helper: render a view container that mounts on first visit, then stays
  // mounted but hidden. Avoids the costly unmount/remount/re-fetch cycle.
  // persist=true (default): mount on first visit, then stay mounted-but-hidden for
  // instant nav — good for light or most-used views.
  // persist=false: unmount when not the active view, freeing memory. Used for the
  // heavy views (Leaflet map, AI Solutions matrix, Kanban) that were the main
  // memory/crash drivers when kept alive forever. They re-mount (~1s) on revisit.
  const persistedView = (id: ViewId, fallbackMessage: string, render: () => React.ReactNode, persist = true) => {
    const isVisited = visitedRef.current.has(id);
    if (!isVisited) return null;
    if (!persist && view !== id) return null;
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
          {persistedView("projects",     "Projects failed to load",     () => <KanbanBoard ownerFilter={ownerFilter} onCountsChanged={refreshCounts} />, false)}
          {persistedView("clients",      "Clients failed to load",      () => <LiveClients ownerFilter={ownerFilter} onCountsChanged={refreshCounts}
            onOpenDashboard={(id) => { setDashClientId(id); setView("client_dash"); }} />)}
          {persistedView("client_dash",  "Client Dashboard failed to load", () => <ClientDashboard projectId={dashClientId} onSelectClient={setDashClientId} active={view === "client_dash"} />)}
          {persistedView("dashboard",    "Dashboard failed to load",    () => <Dashboard ownerFilter={ownerFilter} active={view === "dashboard"} />)}
          {persistedView("map",          "Map failed to load",          () => <MapView ownerFilter={ownerFilter} />, false)}
          {persistedView("ai_solutions", "AI Solutions failed to load", () => <AISolutions />, false)}
          {persistedView("schedule",     "Schedule failed to load",     () => <Schedule />)}
          {persistedView("todos",        "To-Do failed to load",        () => <Todos ownerFilter={ownerFilter} onCountChanged={setTodoCount} />)}
          {persistedView("pricing",      "Pricing failed to load",      () => <Pricing />)}
          {persistedView("referrals",    "Referrals failed to load",    () => <Referrals />)}
        </Suspense>
      </div>
    </ToastProvider>
  );
}
