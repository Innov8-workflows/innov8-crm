"use client";

import { memo } from "react";
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

// The row you last clicked into stays tinted until you click another one, so
// that while the Intel or Call-log popover is open — or you're mid-call looking
// away from the screen — it's still obvious which prospect you're working on.
// Stronger than the hover wash (which is barely there by design) but still faint
// enough to read under the status colours above.
const ACTIVE_BG = "rgba(234,88,12,0.10)";
const HOVER_BG = "rgba(255,255,255,0.02)";

interface DraggableRowProps {
  row: Row<Lead>;
  isActive?: boolean;
  onActivate?: (id: number) => void;
}

function DraggableRowBase({ row, isActive = false, onActivate }: DraggableRowProps) {
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

  const statusBg = isOverdue ? "rgba(239,68,68,0.06)" : ROW_COLORS[status] || "";
  // Active wins over the status tint; the hover handlers below defer to it.
  const bgColor = isActive ? ACTIVE_BG : statusBg;

  return (
    <tr ref={setNodeRef} style={{ ...style, background: bgColor }}
      className="transition-colors"
      // mousedown, not click: the Intel and Call-log buttons stopPropagation on
      // click, so a click handler here would never fire for exactly the two
      // cases this highlight exists for.
      onMouseDown={() => onActivate?.(row.original.id)}
      onMouseEnter={(e) => { if (!isActive && !statusBg) e.currentTarget.style.background = HOVER_BG; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = statusBg; }}>
      {row.getVisibleCells().map((cell, idx) => {
        const hasDropdown = cell.column.id === "status" || cell.column.id === "owner" || cell.column.id === "warmth";
        return (
          <td key={cell.id} data-col={cell.column.id} className={`px-1 py-0.5 ${hasDropdown ? "overflow-visible" : "overflow-hidden text-ellipsis whitespace-nowrap"}`}
            style={{
              width: cell.column.getSize(), maxWidth: cell.column.getSize(),
              borderBottom: "1px solid var(--surface2)",
              // Accent bar on the first cell — an inset shadow rather than a real
              // border so nothing shifts sideways when a row becomes active.
              ...(isActive && idx === 0 ? { boxShadow: "inset 3px 0 0 var(--accent)" } : {}),
            }}
            {...(cell.column.id === "drag_handle" ? { ...attributes, ...listeners } : {})}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

// Memoise so a single row update doesn't re-render all 298 sibling rows.
// Re-render only when the row's actual data fields or columns change.
const DraggableRow = memo(DraggableRowBase, (prev, next) => {
  const a = prev.row.original;
  const b = next.row.original;
  // Must come first: activating a row changes no lead FIELD, so without this
  // the memo would skip the re-render and the highlight would never appear.
  if (prev.isActive !== next.isActive) return false;
  if (a.id !== b.id) return false;
  if (a.status !== b.status) return false;
  if (a.emailed !== b.emailed) return false;
  if (a.messaged !== b.messaged) return false;
  if (a.responded !== b.responded) return false;
  if (a.followed_up !== b.followed_up) return false;
  if (a.business_name !== b.business_name) return false;
  if (a.contact_name !== b.contact_name) return false;
  if (a.email !== b.email) return false;
  if (a.phone !== b.phone) return false;
  if (a.business_type !== b.business_type) return false;
  if (a.location !== b.location) return false;
  if (a.capex !== b.capex) return false;
  if (a.follow_up_date !== b.follow_up_date) return false;
  if (a.demo_site_url !== b.demo_site_url) return false;
  if (a.owner !== b.owner) return false;
  if (a.updated_at !== b.updated_at) return false;
  // Column structure could have shifted — compare visible cell count
  if (prev.row.getVisibleCells().length !== next.row.getVisibleCells().length) return false;
  return true;
});

export default DraggableRow;
