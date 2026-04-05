"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project, ProjectTask, ProjectFile } from "@/types";
import { PROJECT_STAGES } from "@/types";

interface Props {
  project: Project;
  onClose: () => void;
  onUpdate: () => void;
  onComplete: (projectId: number) => void;
}

export default function ProjectDetailModal({ project, onClose, onUpdate, onComplete }: Props) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [details, setDetails] = useState(project);
  const [activeTab, setActiveTab] = useState<"tasks" | "files" | "details">("tasks");
  const [newTask, setNewTask] = useState("");
  const [newTaskStage, setNewTaskStage] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/project-tasks?project_id=${project.id}`);
    const data = await res.json();
    setTasks(data.tasks || []);
  }, [project.id]);

  const fetchFiles = useCallback(async () => {
    const res = await fetch(`/api/project-files?project_id=${project.id}`);
    const data = await res.json();
    setFiles(data.files || []);
  }, [project.id]);

  useEffect(() => { fetchTasks(); fetchFiles(); }, [fetchTasks, fetchFiles]);

  const toggleTask = async (taskId: number, completed: boolean) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: completed ? 1 : 0 } : t)));
    await fetch("/api/project-tasks", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, completed }),
    });
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    await fetch("/api/project-tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: project.id, title: newTask, stage: newTaskStage }),
    });
    setNewTask("");
    setNewTaskStage("");
    fetchTasks();
  };

  const deleteTask = async (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch("/api/project-tasks", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const addFile = async () => {
    if (!newFileUrl.trim() || !newFileName.trim()) return;
    await fetch("/api/project-files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: project.id, name: newFileName, url: newFileUrl }),
    });
    setNewFileUrl("");
    setNewFileName("");
    fetchFiles();
  };

  const deleteFile = async (id: number) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    await fetch("/api/project-files", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const updateDetail = async (field: string, value: string | number) => {
    setDetails((prev) => ({ ...prev, [field]: value }));
    setEditing(null);
    await fetch(`/api/projects/${project.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    onUpdate();
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const tasksByStage = PROJECT_STAGES.map((s) => ({
    ...s,
    tasks: tasks.filter((t) => t.stage === s.value),
  }));
  const unstagedTasks = tasks.filter((t) => !t.stage || !PROJECT_STAGES.find((s) => s.value === t.stage));

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl shadow-2xl" style={{ background: "#161616", border: "1px solid #2a2a2a" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between p-5" style={{ borderBottom: "1px solid #2a2a2a" }}>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate" style={{ color: "#f0f0f0" }}>{details.business_name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm" style={{ color: "#888" }}>{details.contact_name} · {details.email}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: PROJECT_STAGES.find((s) => s.value === details.stage)?.color + "25",
                  color: PROJECT_STAGES.find((s) => s.value === details.stage)?.color }}>
                {PROJECT_STAGES.find((s) => s.value === details.stage)?.label}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full" style={{ background: "#252525" }}>
                <div className="h-2 rounded-full transition-all" style={{ width: `${progress}%`, background: progress === 100 ? "#22c55e" : "#ea580c" }} />
              </div>
              <span className="text-xs font-medium" style={{ color: progress === 100 ? "#22c55e" : "#888" }}>
                {completedCount}/{totalTasks} tasks
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {progress === 100 && (
              <button className="px-3 py-1.5 text-sm font-semibold rounded-md" style={{ background: "#22c55e", color: "#fff" }}
                onClick={() => onComplete(project.id)}>
                Mark Complete
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md transition-colors" style={{ color: "#666" }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#f0f0f0"}
              onMouseLeave={(e) => e.currentTarget.style.color = "#666"}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-5" style={{ borderBottom: "1px solid #2a2a2a" }}>
          {(["tasks", "files", "details"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2.5 text-sm font-medium capitalize"
              style={{
                color: activeTab === tab ? "#ea580c" : "#666",
                borderBottom: activeTab === tab ? "2px solid #ea580c" : "2px solid transparent",
              }}>
              {tab} {tab === "tasks" ? `(${completedCount}/${totalTasks})` : tab === "files" ? `(${files.length})` : ""}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {activeTab === "tasks" && (
            <div className="space-y-4">
              {/* Add task */}
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-1.5 text-sm rounded-md"
                  style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0", outline: "none" }}
                  placeholder="Add a task..." value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
                <select className="px-2 py-1.5 text-xs rounded-md"
                  style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#888", outline: "none" }}
                  value={newTaskStage} onChange={(e) => setNewTaskStage(e.target.value)}>
                  <option value="">No stage</option>
                  {PROJECT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button onClick={addTask} className="px-3 py-1.5 text-sm rounded-md font-medium"
                  style={{ background: "#ea580c", color: "#fff" }}>Add</button>
              </div>

              {/* Tasks grouped by stage */}
              {tasksByStage.filter((s) => s.tasks.length > 0).map((stageGroup) => (
                <div key={stageGroup.value}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: stageGroup.color }} />
                    <span className="text-xs font-semibold uppercase" style={{ color: stageGroup.color }}>{stageGroup.label}</span>
                  </div>
                  <div className="space-y-1">
                    {stageGroup.tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 px-3 py-2 rounded-lg group"
                        style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                        <button onClick={() => toggleTask(task.id, !task.completed)}
                          className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
                          style={{ border: task.completed ? "none" : "1px solid #444",
                            background: task.completed ? "#22c55e" : "transparent" }}>
                          {task.completed && <svg className="w-3 h-3" fill="#fff" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                        </button>
                        <span className="flex-1 text-sm" style={{
                          color: task.completed ? "#555" : "#ddd",
                          textDecoration: task.completed ? "line-through" : "none",
                        }}>{task.title}</span>
                        <button onClick={() => deleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 transition-opacity"
                          style={{ color: "#555" }}
                          onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                          onMouseLeave={(e) => e.currentTarget.style.color = "#555"}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {unstagedTasks.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase mb-2" style={{ color: "#555" }}>Other Tasks</div>
                  <div className="space-y-1">
                    {unstagedTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 px-3 py-2 rounded-lg group"
                        style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                        <button onClick={() => toggleTask(task.id, !task.completed)}
                          className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
                          style={{ border: task.completed ? "none" : "1px solid #444",
                            background: task.completed ? "#22c55e" : "transparent" }}>
                          {task.completed && <svg className="w-3 h-3" fill="#fff" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                        </button>
                        <span className="flex-1 text-sm" style={{
                          color: task.completed ? "#555" : "#ddd",
                          textDecoration: task.completed ? "line-through" : "none",
                        }}>{task.title}</span>
                        <button onClick={() => deleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 transition-opacity" style={{ color: "#555" }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "files" && (
            <div className="space-y-4">
              {/* Add file */}
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-1.5 text-sm rounded-md"
                  style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0", outline: "none" }}
                  placeholder="File name..." value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)} />
                <input className="flex-1 px-3 py-1.5 text-sm rounded-md"
                  style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0", outline: "none" }}
                  placeholder="URL (paste link)..." value={newFileUrl}
                  onChange={(e) => setNewFileUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addFile(); }} />
                <button onClick={addFile} className="px-3 py-1.5 text-sm rounded-md font-medium"
                  style={{ background: "#ea580c", color: "#fff" }}>Add</button>
              </div>

              {files.length === 0 ? (
                <div className="text-center py-8" style={{ color: "#444" }}>
                  <p className="text-sm">No files yet</p>
                  <p className="text-xs mt-1">Add links to Google Drive, Dropbox, or any URL</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg group"
                      style={{ background: "#1e1e1e", border: "1px solid #2a2a2a" }}>
                      <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: "#252525" }}>
                        <svg className="w-4 h-4" style={{ color: "#888" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <a href={file.url} target="_blank" rel="noreferrer"
                          className="text-sm font-medium truncate block" style={{ color: "#ea580c" }}>{file.name}</a>
                        <p className="text-xs truncate" style={{ color: "#555" }}>{file.url}</p>
                      </div>
                      <span className="text-xs" style={{ color: "#444" }}>
                        {new Date(file.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                      <button onClick={() => deleteFile(file.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 transition-opacity" style={{ color: "#555" }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "#555"}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "details" && (
            <div className="space-y-4">
              {[
                { key: "domain", label: "Domain", placeholder: "e.g. smithplumbing.co.uk" },
                { key: "hosting_info", label: "Hosting", placeholder: "e.g. GitHub Pages, Vercel" },
                { key: "monthly_fee", label: "Monthly Fee (£)", placeholder: "0", type: "number" },
                { key: "renewal_date", label: "Renewal Date", placeholder: "", type: "date" },
                { key: "login_details", label: "Login Details", placeholder: "e.g. Hosting panel credentials" },
                { key: "project_notes", label: "Project Notes", placeholder: "Any additional notes..." },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium mb-1 uppercase" style={{ color: "#666" }}>{field.label}</label>
                  {editing === field.key ? (
                    field.key === "project_notes" ? (
                      <textarea className="w-full px-3 py-2 text-sm rounded-md" rows={3}
                        style={{ background: "#1e1e1e", border: "1px solid #ea580c", color: "#f0f0f0", outline: "none", resize: "vertical" }}
                        defaultValue={(details as Record<string, unknown>)[field.key] as string}
                        autoFocus
                        onBlur={(e) => updateDetail(field.key, e.target.value)} />
                    ) : (
                      <input className="w-full px-3 py-2 text-sm rounded-md"
                        style={{ background: "#1e1e1e", border: "1px solid #ea580c", color: "#f0f0f0", outline: "none",
                          ...(field.type === "date" ? { colorScheme: "dark" } : {}) }}
                        type={field.type || "text"}
                        defaultValue={(details as Record<string, unknown>)[field.key] as string}
                        autoFocus
                        onBlur={(e) => updateDetail(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") updateDetail(field.key, field.type === "number" ? Number((e.target as HTMLInputElement).value) : (e.target as HTMLInputElement).value); }} />
                    )
                  ) : (
                    <div className="px-3 py-2 text-sm rounded-md cursor-pointer min-h-[36px]"
                      style={{ background: "#1e1e1e", border: "1px solid #2a2a2a",
                        color: (details as Record<string, unknown>)[field.key] ? "#f0f0f0" : "#444" }}
                      onClick={() => setEditing(field.key)}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444"}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2a2a2a"}>
                      {field.key === "monthly_fee"
                        ? (details.monthly_fee ? `£${details.monthly_fee}` : field.placeholder)
                        : (details as Record<string, unknown>)[field.key] as string || field.placeholder}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
