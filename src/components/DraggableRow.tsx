"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { flexRender, type Row } from "@tanstack/react-table";
import type { Lead } from "@/types";

const ROW_COLORS: Record<string, string> = {
  new: "",
  contacted: "rgba(59,130,246,0.04)",
  demo_sent: "rgba(168,85,247,0.04)",
  interested: "rgba(234,179,8,0.04)",
  meeting_booked: "rgba(34,197,94,0.06)",
  won: "rgba(5,150,105,0.08)",
  lost: "rgba(239,68,68,0.04)",
};

interface DraggableRowProps {
  row: Row<Lead>;
}

export default function DraggableRow({ row }: DraggableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.original.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const status = row.original.status || "new";
  const followUpDate = row.original.follow_up_date;
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = followUpDate && followUpDate < today && status !== "won" && status !== "lost";

  const bgColor = isOverdue ? "rgba(239,68,68,0.06)" : ROW_COLORS[status] || "";

  return (
    <tr ref={setNodeRef} style={{ ...style, background: bgColor }}
      className="transition-colors"
      onMouseEnter={(e) => { if (!bgColor) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
      onMouseLeave={(e) => { if (!bgColor) e.currentTarget.style.background = ""; else e.currentTarget.style.background = bgColor; }}>
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="px-1 py-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize(), borderBottom: "1px solid #1e1e1e" }}
          {...(cell.column.id === "drag_handle" ? { ...attributes, ...listeners } : {})}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}
