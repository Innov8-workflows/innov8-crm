"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { flexRender, type Row } from "@tanstack/react-table";
import type { Lead } from "@/types";
import { ROW_COLORS } from "@/types";

interface DraggableRowProps {
  row: Row<Lead>;
}

export default function DraggableRow({ row }: DraggableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.original.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Row colour based on pipeline status + overdue follow-up highlight
  const status = row.original.status || "new";
  const followUpDate = row.original.follow_up_date;
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = followUpDate && followUpDate < today && status !== "won" && status !== "lost";

  const rowColor = isOverdue
    ? "bg-red-50/60 border-l-2 border-l-red-400"
    : ROW_COLORS[status] || "";

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${rowColor}`}
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className="px-1 py-0.5"
          style={{ width: cell.column.getSize() }}
          {...(cell.column.id === "drag_handle" ? { ...attributes, ...listeners } : {})}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}
