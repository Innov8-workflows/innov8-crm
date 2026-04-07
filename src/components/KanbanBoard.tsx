"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project } from "@/types";
import { PROJECT_STAGES } from "@/types";
import ProjectDetailModal from "./ProjectDetailModal";

export default function KanbanBoard({ ownerFilter = "" }: { ownerFilter?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [dragProject, setDragProject] = useState<number | null>(null);

  const fetchProjects = useCallback(async () => {
    // Fetch both active incomplete and active completed projects for the kanban
    // Cover images are now included in the API response (no extra requests needed)
    const ownerParam = ownerFilter ? `&owner=${encodeURIComponent(ownerFilter)}` : "";
    const [incRes, compRes] = await Promise.all([
      fetch(`/api/projects?completed=false${ownerParam}`),
      fetch(`/api/projects?completed=true${ownerParam}`),
    ]);
    const [incData, compData] = await Promise.all([incRes.json(), compRes.json()]);
    const allProjs = [...(incData.projects || []), ...(compData.projects || [])];
    // Mark completed projects with stage "completed" for display
    const projs = allProjs.map((p: Project) => ({
      ...p,
      stage: p.completed_at ? "completed" : p.stage,
    }));
    setProjects(projs);
    setLoading(false);
  }, [ownerFilter]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const moveProject = useCallback(async (projectId: number, newStage: string) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, stage: newStage } : p)));

    if (newStage === "completed") {
      // Moving to completed — set completed_at
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "launch", completed_at: new Date().toISOString() }),
      });
    } else {
      // Moving to a non-completed stage — clear completed_at if it was completed
      const project = projects.find((p) => p.id === projectId);
      const updates: Record<string, string> = { stage: newStage };
      if (project?.completed_at) updates.completed_at = "";
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    }
  }, [projects]);

  const completeProject = useCallback(async (projectId: number) => {
    const now = new Date().toISOString();
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: now }),
    });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, stage: "completed", completed_at: now } : p)));
    setSelectedProject(null);
  }, []);

  const getProjectsByStage = (stage: string) => projects.filter((p) => p.stage === stage);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "#555" }}>Loading projects...</div>;
  }

  return (
    <>
      {/* Project Dashboard */}
      <div style={{ background: "#131313", borderBottom: "1px solid #2a2a2a" }}>
        <div className="grid gap-3 px-4 py-3" style={{ gridTemplateColumns: `repeat(${PROJECT_STAGES.length + 1}, 1fr)` }}>
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#ea580c15" }}>
              <svg className="w-5 h-5" fill="none" stroke="#ea580c" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.007.662-1.858 1.574-2.144z" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-bold" style={{ color: "#f0f0f0" }}>{projects.length}</div>
              <div className="text-xs" style={{ color: "#666" }}>Total Projects</div>
            </div>
          </div>
          {PROJECT_STAGES.map((stage) => {
            const count = getProjectsByStage(stage.value).length;
            return (
              <div key={stage.value} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${stage.color}15` }}>
                  <div className="w-3 h-3 rounded-full" style={{ background: stage.color }} />
                </div>
                <div>
                  <div className="text-xl font-bold" style={{ color: count > 0 ? stage.color : "#444" }}>{count}</div>
                  <div className="text-xs" style={{ color: "#666" }}>{stage.label}</div>
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
                style={{ background: isCompleted ? "#0d1f0d" : "#161616", border: `1px solid ${isCompleted ? "#059669" + "40" : "#2a2a2a"}` }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = stage.color; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = isCompleted ? "#059669" + "40" : "#2a2a2a"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = isCompleted ? "#059669" + "40" : "#2a2a2a";
                  if (dragProject) moveProject(dragProject, stage.value);
                  setDragProject(null);
                }}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid ${isCompleted ? "#059669" + "30" : "#2a2a2a"}` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                    <span className="text-sm font-semibold" style={{ color: "#ccc" }}>{stage.label}</span>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#252525", color: "#888" }}>
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
                      className="rounded-lg p-3 cursor-pointer transition-all"
                      style={{
                        background: isCompleted ? "#132613" : "#1e1e1e",
                        border: `1px solid ${dragProject === project.id ? stage.color : isCompleted ? "#059669" + "30" : "#2a2a2a"}`,
                        opacity: dragProject === project.id ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444"}
                      onMouseLeave={(e) => { if (dragProject !== project.id) e.currentTarget.style.borderColor = isCompleted ? "#059669" + "30" : "#2a2a2a"; }}
                      onClick={() => setSelectedProject(project)}
                    >
                      {/* Cover image */}
                      {project.cover_image && (
                        <div className="w-full h-28 -mt-3 -mx-3 mb-2 overflow-hidden rounded-t-lg" style={{ width: "calc(100% + 24px)" }}>
                          <img src={project.cover_image} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        </div>
                      )}
                      <h3 className="text-sm font-medium truncate" style={{ color: "#f0f0f0" }}>
                        {project.business_name}
                      </h3>
                      <p className="text-xs mt-1 truncate" style={{ color: "#666" }}>
                        {project.contact_name || "No contact"} {project.business_type ? `· ${project.business_type}` : ""}
                      </p>
                      {project.domain && (
                        <p className="text-xs mt-1 truncate" style={{ color: "#ea580c" }}>
                          {project.domain}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs" style={{ color: "#555" }}>
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
                    </div>
                  ))}

                  {stageProjects.length === 0 && (
                    <div className="text-center py-8 text-xs" style={{ color: "#333" }}>
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
