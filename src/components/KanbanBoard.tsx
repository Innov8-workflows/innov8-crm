"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project } from "@/types";
import { PROJECT_STAGES } from "@/types";
import ProjectDetailModal from "./ProjectDetailModal";

export default function KanbanBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [dragProject, setDragProject] = useState<number | null>(null);

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects?completed=false");
    const data = await res.json();
    setProjects(data.projects || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const moveProject = useCallback(async (projectId: number, newStage: string) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, stage: newStage } : p)));
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
  }, []);

  const completeProject = useCallback(async (projectId: number) => {
    const now = new Date().toISOString();
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: now }),
    });
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setSelectedProject(null);
  }, []);

  const getProjectsByStage = (stage: string) => projects.filter((p) => p.stage === stage);

  const getTaskProgress = (project: Project) => {
    // We don't have tasks loaded here — just show the stage
    return project.stage;
  };
  void getTaskProgress;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "#555" }}>Loading projects...</div>;
  }

  return (
    <>
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {PROJECT_STAGES.map((stage) => {
            const stageProjects = getProjectsByStage(stage.value);
            return (
              <div
                key={stage.value}
                className="w-72 flex-shrink-0 flex flex-col rounded-xl"
                style={{ background: "#161616", border: "1px solid #2a2a2a" }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = stage.color; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = "#2a2a2a";
                  if (dragProject) moveProject(dragProject, stage.value);
                  setDragProject(null);
                }}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid #2a2a2a" }}>
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
                        background: "#1e1e1e",
                        border: `1px solid ${dragProject === project.id ? stage.color : "#2a2a2a"}`,
                        opacity: dragProject === project.id ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444"}
                      onMouseLeave={(e) => { if (dragProject !== project.id) e.currentTarget.style.borderColor = "#2a2a2a"; }}
                      onClick={() => setSelectedProject(project)}
                    >
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
                          {new Date(project.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
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
                      Drag projects here
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
