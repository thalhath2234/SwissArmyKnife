"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, RotateCw, Trash2 } from "lucide-react";

export type OrganizablePage = {
  id: string;
  sourceIndex: number;
  rotation: number;
  selected: boolean;
  previewUrl: string;
};

interface SortablePageCardProps {
  page: OrganizablePage;
  index: number;
  selectable: boolean;
  onToggleSelect: () => void;
  onRotate: () => void;
  onDelete: () => void;
  onPeek?: () => void;
  showDelete: boolean;
}

export function SortablePageCard({
  page,
  index,
  selectable,
  onToggleSelect,
  onRotate,
  onDelete,
  onPeek,
  showDelete,
}: SortablePageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`group relative cursor-grab overflow-hidden rounded-2xl border bg-[#14181f] transition active:cursor-grabbing ${
        isDragging
          ? "scale-[1.03] border-teal-300/50 shadow-[0_18px_40px_rgba(0,0,0,0.45)] ring-1 ring-teal-300/30"
          : page.selected
            ? "border-teal-300/40 ring-1 ring-teal-300/20"
            : "border-white/10"
      }`}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onPeek?.();
      }}
    >
      <div className="relative aspect-[3/4] bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={page.previewUrl}
          alt={`Page ${index + 1}`}
          draggable={false}
          className="pointer-events-none h-full w-full object-contain transition-transform duration-200"
          style={{ transform: `rotate(${page.rotation}deg)` }}
        />

        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-medium text-zinc-100">
          {index + 1}
        </span>

        {selectable && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect();
            }}
            className={`absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border transition ${
              page.selected
                ? "border-teal-300 bg-teal-300 text-zinc-950"
                : "border-white/20 bg-black/60 text-zinc-300 hover:border-white/40"
            }`}
            aria-label={page.selected ? "Deselect page" : "Select page"}
          >
            {page.selected ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRotate();
            }}
            className="cursor-pointer rounded-md bg-white/10 p-1.5 text-zinc-100 hover:bg-white/20"
            aria-label="Rotate page"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          {showDelete && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="cursor-pointer rounded-md bg-white/10 p-1.5 text-zinc-100 hover:bg-rose-500/70"
              aria-label="Delete page"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
