"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project } from "@/types";
import { PROJECT_STAGES } from "@/types";
import ProjectDetailModal from "./ProjectDetailModal";
import SetupPills, { type SetupField } from "./SetupPills";
import ReviewsBadge, { type ReviewValues } from "./ReviewsBadge";
import LoadingAI from "./LoadingAI";

export default function KanbanBoard({ ownerFilter = "", onCountsChanged }: { ownerFilter?: string; onCountsChanged?: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [dragProject, setDragProject] = useState<number | null>(null);

  const fetchProjects = useCallback(async () => {
    // Single request for all kanban projects (active + completed) — halves roundtrips
    // and lets the server share the cover-image query across the full set.
    const ownerParam = ownerFilter ? `?owner=${encodeURIComponent(ownerFilter)}` : "";
    const res = await fetch(`/api/projects${ownerParam}`);
    const data = await res.json();
    const allProjs = data.projects || [];
    // Mark completed projects with stage "completed" for display
    const projs = allProjs
      .filter((p: Project) => p.client_status !== "lost") // exclude lost clients from kanban
      .map((p: Project) => ({
        ...p,
        stage: p.completed_at ? "completed" : p.stage,
      }));
    setProjects(projs);
    setLoading(false);
  }, [ownerFilter]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Toggle a setup milestone (GA4 / Search Console / Business Profile) — optimistic.
  const toggleSetup = useCallback((projectId: number, field: SetupField, next: number) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, [field]: next } : p)));
    fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: next }),
    }).catch(() => {});
  }, []);

  // Save the manually-tracked Google/Facebook review stats — optimistic, one PUT.
  const saveReviews = useCallback((projectId: number, fields: ReviewValues) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...fields } : p)));
    fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).catch(() => {});
  }, []);

  const moveProject = useCallback(async (projectId: number, newStage: string) => {
    const project = projects.find((p) => p.id === projectId);
    const wasCompleted = !!project?.completed_at;
    const willBeCompleted = newStage === "completed";

    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, stage: newStage } : p)));

    if (willBeCompleted) {
      // Moving to completed — set completed_at
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "launch", completed_at: new Date().toISOString() }),
      });
    } else {
      // Moving to a non-completed stage — clear completed_at if it was completed
      const updates: Record<string, string> = { stage: newStage };
      if (wasCompleted) updates.completed_at = "";
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    }

    // Refresh nav counts when active/completed status flips
    if (wasCompleted !== willBeCompleted) onCountsChanged?.();
  }, [projects, onCountsChanged]);

  const completeProject = useCallback(async (projectId: number) => {
    const now = new Date().toISOString();
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: now }),
    });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, stage: "completed", completed_at: now } : p)));
    setSelectedProject(null);
    onCountsChanged?.();
  }, [onCountsChanged]);

  const deleteProject = useCallback(async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const confirmed = window.confirm(
      `Delete project "${project.business_name}"?\n\nThis permanently removes the project AND its associated lead, tasks, files, notes, and activity. This cannot be undone.`
    );
    if (!confirmed) return;
    // Optimistic remove
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onCountsChanged?.();
    } catch {
      // Rollback on failure
      fetchProjects();
      window.alert("Delete failed — please try again.");
    }
  }, [fetchProjects, onCountsChanged]);

  const getProjectsByStage = (stage: string) => projects.filter((p) => p.stage === stage);

  if (loading) {
    return <LoadingAI message="Loading projects" />;
  }

  return (
    <>
      {/* Project Dashboard */}
      <div style={{ background: "var(--stats-bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="grid gap-3 px-4 py-3" style={{ gridTemplateColumns: `repeat(${PROJECT_STAGES.length + 1}, 1fr)` }}>
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#ea580c15" }}>
              <svg className="w-5 h-5" fill="none" stroke="#ea580c" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.007.662-1.858 1.574-2.144z" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold" style={{ color: "var(--text)" }}>{projects.length}</div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>Total Projects</div>
            </div>
          </div>
          {PROJECT_STAGES.map((stage) => {
            const count = getProjectsByStage(stage.value).length;
            return (
              <div key={stage.value} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${stage.color}15` }}>
                  <div className="w-3 h-3 rounded-full" style={{ background: stage.color }} />
                </div>
                <div>
                  <div className="text-xl font-bold" style={{ color: count > 0 ? stage.color : "var(--text-quaternary)" }}>{count}</div>
                  <div className="text-xs" style={{ color: "var(--text-dim)" }}>{stage.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {PROJECT_STAGES.map((stage) => {
            const stageProjects = getProjectsByStage(stage.value);
            const isCompleted = stage.value === "completed";
            return (
              <div
                key={stage.value}
                className="w-72 flex-shrink-0 flex flex-col rounded-xl"
                style={{ background: isCompleted ? "#0d1f0d" : "var(--surface)", border: `1px solid ${isCompleted ? "#059669" + "40" : "var(--border)"}` }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = stage.color; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = isCompleted ? "#059669" + "40" : "var(--border)"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = isCompleted ? "#059669" + "40" : "var(--border)";
                  if (dragProject) moveProject(dragProject, stage.value);
                  setDragProject(null);
                }}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid ${isCompleted ? "#059669" + "30" : "var(--border)"}` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                    <span className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{stage.label}</span>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface3)", color: "var(--text-muted)" }}>
                    {stageProjects.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageProjects.map((project) => (
                    <div
                      key={project.id}
                      draggable
                      onDragStart={() => setDragProject(project.id)}
                      onDragEnd={() => setDragProject(null)}
                      className="rounded-lg p-3 cursor-pointer transition-all relative group"
                      style={{
                        background: isCompleted ? "#132613" : "var(--surface2)",
                        border: `1px solid ${dragProject === project.id ? stage.color : isCompleted ? "#059669" + "30" : "var(--border)"}`,
                        opacity: dragProject === project.id ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--text-quaternary)"}
                      onMouseLeave={(e) => { if (dragProject !== project.id) e.currentTarget.style.borderColor = isCompleted ? "#059669" + "30" : "var(--border)"; }}
                      onClick={() => setSelectedProject(project)}
                    >
                      {/* Bin icon — appears on hover */}
                      <button
                        onClick={(e) => deleteProject(project, e)}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Delete project"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 z-10"
                        style={{
                          background: "rgba(0,0,0,0.6)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          backdropFilter: "blur(4px)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.borderColor = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.6)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="#fff" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                      {/* Cover image — lazy-loaded from dedicated endpoint, cached by browser */}
                      {project.has_cover && (
                        <div className="w-full h-28 -mt-3 -mx-3 mb-2 overflow-hidden rounded-t-lg" style={{ width: "calc(100% + 24px)" }}>
                          <img
                            src={`/api/projects/${project.id}/cover?v=${project.cover_version ?? 0}`}
                            alt=""
                            className="w-full h-full object-cover cf-img"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                          />
                        </div>
                      )}
                      <h3 className="text-sm font-medium truncate cf-name" style={{ color: "var(--text)" }}>
                        {project.business_name}
                      </h3>
                      <p className="text-xs mt-1 truncate" style={{ color: "var(--text-dim)" }}>
                        <span className="cf-name">{project.contact_name || "No contact"}</span> {project.business_type ? `· ${project.business_type}` : ""}
                      </p>
                      {project.domain && (
                        <a
                          href={/^https?:\/\//i.test(project.domain) ? project.domain : `https://${project.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${project.domain}`}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="block text-xs mt-1 truncate hover:underline cf-name"
                          style={{ color: "var(--accent)" }}
                        >
                          {project.domain}
                        </a>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {isCompleted && project.completed_at
                            ? `Done ${new Date(project.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                            : new Date(project.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        {project.monthly_fee > 0 && (
                          <span className="text-xs font-medium" style={{ color: "#22c55e" }}>
                            £{project.monthly_fee}/mo
                          </span>
                        )}
                      </div>
                      <ReviewsBadge values={project} onSave={(f) => saveReviews(project.id, f)} />
                      <SetupPills values={project} onToggle={(field, next) => toggleSetup(project.id, field, next)} />
                    </div>
                  ))}

                  {stageProjects.length === 0 && (
                    <div className="text-center py-8 text-xs" style={{ color: "var(--border-light)" }}>
                      {isCompleted ? "Drag completed projects here" : "Drag projects here"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onUpdate={fetchProjects}
          onComplete={completeProject}
        />
      )}
    </>
  );
}
