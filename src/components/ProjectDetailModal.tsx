"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project, ProjectTask, ProjectFile } from "@/types";
import { PROJECT_STAGES } from "@/types";

interface Props {
  project: Project;
  onClose: () => void;
  onUpdate: () => void;
  onComplete: (projectId: number) => void;
  onMarkLost?: (projectId: number) => void;
  onReactivate?: (projectId: number) => void;
  isLostView?: boolean;
}

export default function ProjectDetailModal({ project, onClose, onUpdate, onComplete, onMarkLost, onReactivate, isLostView }: Props) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [details, setDetails] = useState(project);
  const [activeTab, setActiveTab] = useState<"tasks" | "files" | "details">("tasks");
  const [newTask, setNewTask] = useState("");
  const [newTaskStage, setNewTaskStage] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const stageOrder: string[] = PROJECT_STAGES.map((s) => s.value).filter((s) => s !== "completed");

  const toggleTask = async (taskId: number, completed: boolean) => {
    const updatedTasks = tasks.map((t) => (t.id === taskId ? { ...t, completed: completed ? 1 : 0 } : t));
    setTasks(updatedTasks);
    await fetch("/api/project-tasks", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, completed }),
    });

    // Auto-advance stage when all tasks in current stage are completed
    if (completed && details.stage !== "completed") {
      const currentStage = details.stage;
      const stageTasks = updatedTasks.filter((t) => t.stage === currentStage);
      const allDone = stageTasks.length > 0 && stageTasks.every((t) => t.completed);
      if (allDone) {
        const currentIdx = stageOrder.indexOf(currentStage);
        if (currentIdx !== -1 && currentIdx < stageOrder.length - 1) {
          const nextStage = stageOrder[currentIdx + 1];
          setDetails((prev) => ({ ...prev, stage: nextStage }));
          await fetch(`/api/projects/${project.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: nextStage }),
          });
          onUpdate();
        }
      }
    }
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

  const addFileUrl = async () => {
    if (!newFileUrl.trim() || !newFileName.trim()) return;
    await fetch("/api/project-files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: project.id, name: newFileName, url: newFileUrl }),
    });
    setNewFileUrl("");
    setNewFileName("");
    setShowUrlForm(false);
    fetchFiles();
    onUpdate();
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", String(project.id));
    formData.append("name", file.name);
    await fetch("/api/project-files", { method: "POST", body: formData });
    e.target.value = "";
    fetchFiles();
    onUpdate();
  };

  const setCover = async (fileId: number) => {
    await fetch("/api/project-files", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fileId, is_cover: 1 }),
    });
    setFiles((prev) => prev.map((f) => ({ ...f, is_cover: f.id === fileId ? 1 : 0 } as ProjectFile)));
    onUpdate();
  };

  const deleteFile = async (id: number) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    await fetch("/api/project-files", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const updateDetail = (field: string, value: string | number) => {
    setDetails((prev) => ({ ...prev, [field]: value }));
    setEditing(null);
    setHasUnsavedChanges(true);
  };

  const saveAllDetails = async () => {
    setSaving(true);
    await fetch(`/api/projects/${project.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: details.domain,
        hosting_info: details.hosting_info,
        capex: (details as unknown as Record<string, unknown>).capex ?? 0,
        monthly_fee: details.monthly_fee,
        renewal_date: details.renewal_date,
        login_details: details.login_details,
        project_notes: details.project_notes,
      }),
    });
    setSaving(false);
    setHasUnsavedChanges(false);
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
            {progress === 100 && !project.completed_at && (
              <button className="px-3 py-1.5 text-sm font-semibold rounded-md" style={{ background: "#22c55e", color: "#fff" }}
                onClick={() => onComplete(project.id)}>
                Mark Complete
              </button>
            )}
            {project.completed_at && isLostView && onReactivate && (
              <button className="px-3 py-1.5 text-sm font-semibold rounded-md" style={{ background: "#22c55e", color: "#fff" }}
                onClick={() => onReactivate(project.id)}>
                Restore Client
              </button>
            )}
            {project.completed_at && !isLostView && onMarkLost && (
              <button className="px-3 py-1.5 text-sm font-semibold rounded-md" style={{ background: "#ef4444", color: "#fff" }}
                onClick={() => onMarkLost(project.id)}>
                Mark as Lost
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
              {/* Action buttons */}
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: "#ea580c", color: "#fff" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f97316"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "#ea580c"}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Attach File
                  </div>
                  <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.html,.txt,.zip"
                    onChange={uploadFile} />
                </label>
                <button onClick={() => setShowUrlForm(!showUrlForm)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: "#1e1e1e", border: "1px solid #333", color: "#ccc" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#252525"; e.currentTarget.style.borderColor = "#ea580c"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#1e1e1e"; e.currentTarget.style.borderColor = "#333"; }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  Add URL Link
                </button>
              </div>

              {/* URL form */}
              {showUrlForm && (
                <div className="p-3 rounded-lg space-y-2" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
                  <input className="w-full px-3 py-1.5 text-sm rounded-md"
                    style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0", outline: "none" }}
                    placeholder="File name (e.g. Logo, Contract, Brief)..." value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)} />
                  <input className="w-full px-3 py-1.5 text-sm rounded-md"
                    style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0", outline: "none" }}
                    placeholder="https://drive.google.com/..." value={newFileUrl}
                    onChange={(e) => setNewFileUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addFileUrl(); }} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowUrlForm(false); setNewFileName(""); setNewFileUrl(""); }}
                      className="px-3 py-1.5 text-xs" style={{ color: "#666" }}>Cancel</button>
                    <button onClick={addFileUrl} className="px-4 py-1.5 text-sm rounded-md font-medium"
                      style={{ background: "#ea580c", color: "#fff" }}>Save</button>
                  </div>
                </div>
              )}

              {/* File list */}
              {files.length === 0 ? (
                <div className="text-center py-8" style={{ color: "#444" }}>
                  <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24" style={{ color: "#333" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  <p className="text-sm">No files yet</p>
                  <p className="text-xs mt-1">Upload images, documents or add links</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => {
                    const isImage = (file.file_type || "").startsWith("image/") || (file.url || "").startsWith("data:image/");
                    const isCover = (file as unknown as Record<string, unknown>).is_cover === 1;
                    return (
                      <div key={file.id} className="rounded-lg overflow-hidden group"
                        style={{ background: "#1e1e1e", border: `1px solid ${isCover ? "#ea580c" : "#2a2a2a"}` }}>
                        {/* Image preview */}
                        {isImage && (
                          <div className="w-full h-32 overflow-hidden" style={{ background: "#111" }}>
                            <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {!isImage && (
                            <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{ background: "#252525" }}>
                              <svg className="w-4 h-4" style={{ color: "#888" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <a href={file.url.startsWith("data:") ? undefined : file.url} target="_blank" rel="noreferrer"
                              className="text-sm font-medium truncate block" style={{ color: "#ea580c" }}>{file.name}</a>
                            {!file.url.startsWith("data:") && (
                              <p className="text-xs truncate" style={{ color: "#555" }}>{file.url}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isImage && (
                              <button onClick={() => setCover(file.id)} title={isCover ? "Cover image" : "Set as cover"}
                                className="p-1 rounded" style={{ color: isCover ? "#ea580c" : "#555" }}>
                                <svg className="w-3.5 h-3.5" fill={isCover ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              </button>
                            )}
                            <button onClick={() => deleteFile(file.id)}
                              className="p-1" style={{ color: "#555" }}
                              onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                              onMouseLeave={(e) => e.currentTarget.style.color = "#555"}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "details" && (
            <div className="space-y-4">
              {[
                { key: "domain", label: "Domain", placeholder: "e.g. smithplumbing.co.uk" },
                { key: "hosting_info", label: "Hosting", placeholder: "e.g. GitHub Pages, Vercel" },
                { key: "capex", label: "CAPEX (£)", placeholder: "0", type: "number" },
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
                        defaultValue={(details as unknown as Record<string, unknown>)[field.key] as string}
                        autoFocus
                        onBlur={(e) => updateDetail(field.key, e.target.value)} />
                    ) : (
                      <input className="w-full px-3 py-2 text-sm rounded-md"
                        style={{ background: "#1e1e1e", border: "1px solid #ea580c", color: "#f0f0f0", outline: "none",
                          ...(field.type === "date" ? { colorScheme: "dark" } : {}) }}
                        type={field.type || "text"}
                        defaultValue={(details as unknown as Record<string, unknown>)[field.key] as string}
                        autoFocus
                        onBlur={(e) => updateDetail(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") updateDetail(field.key, field.type === "number" ? Number((e.target as HTMLInputElement).value) : (e.target as HTMLInputElement).value); }} />
                    )
                  ) : (
                    <div className="px-3 py-2 text-sm rounded-md cursor-pointer min-h-[36px]"
                      style={{ background: "#1e1e1e", border: "1px solid #2a2a2a",
                        color: (details as unknown as Record<string, unknown>)[field.key] ? "#f0f0f0" : "#444" }}
                      onClick={() => setEditing(field.key)}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444"}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2a2a2a"}>
                      {field.key === "monthly_fee"
                        ? (details.monthly_fee ? `£${details.monthly_fee}` : field.placeholder)
                        : field.key === "capex"
                        ? ((details as unknown as Record<string, unknown>).capex ? `£${(details as unknown as Record<string, unknown>).capex}` : field.placeholder)
                        : (details as unknown as Record<string, unknown>)[field.key] as string || field.placeholder}
                    </div>
                  )}
                </div>
              ))}

              {/* Save button */}
              <div className="flex items-center justify-between pt-4 mt-2" style={{ borderTop: "1px solid #2a2a2a" }}>
                {hasUnsavedChanges ? (
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "#eab308" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: "#eab308" }} />
                    Unsaved changes
                  </span>
                ) : (
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "#22c55e" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
                    All changes saved
                  </span>
                )}
                <div className="flex items-center gap-2">
                  {details.monthly_fee > 0 && details.email && (
                    <button
                      onClick={async () => {
                        const res = await fetch("/api/invoices/send", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ project_id: project.id }),
                        });
                        const data = await res.json();
                        alert(data.ok ? `Invoice sent for £${data.amount}` : `Error: ${data.error}`);
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5"
                      style={{ background: "#3b82f6", color: "#fff" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#2563eb"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "#3b82f6"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                      </svg>
                      Send Invoice
                    </button>
                  )}
                  <button
                    onClick={saveAllDetails}
                    disabled={!hasUnsavedChanges || saving}
                    className="px-5 py-2 text-sm font-semibold rounded-lg transition-all"
                    style={{
                      background: hasUnsavedChanges ? "#ea580c" : "#252525",
                      color: hasUnsavedChanges ? "#fff" : "#555",
                      opacity: saving ? 0.6 : 1,
                      cursor: hasUnsavedChanges ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => { if (hasUnsavedChanges) e.currentTarget.style.background = "#f97316"; }}
                    onMouseLeave={(e) => { if (hasUnsavedChanges) e.currentTarget.style.background = "#ea580c"; }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
