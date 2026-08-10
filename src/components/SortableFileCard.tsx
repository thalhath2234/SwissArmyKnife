"use client";

import { useEffect, useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, LoaderCircle, X } from "lucide-react";
import { createFilePreview, formatBytes } from "@/lib/pdf/preview";
import type { UploadedFile } from "@/lib/files/uploaded";

interface SortableFileCardProps {
  item: UploadedFile;
  index: number;
  onRemove: () => void;
  dragEnabled?: boolean;
}

export function SortableFileCard({
  item,
  index,
  onRemove,
  dragEnabled = true,
}: SortableFileCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !dragEnabled,
  });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setLoading(true);
    setFailed(false);
    setPreviewUrl(null);

    createFilePreview(item.file)
      .then((preview) => {
        if (!active) {
          URL.revokeObjectURL(preview.url);
          return;
        }
        objectUrl = preview.url;
        setPreviewUrl(preview.url);
        setPageCount(preview.pageCount);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.file]);

  const meta = useMemo(() => {
    const parts = [formatBytes(item.file.size)];
    if (pageCount) parts.push(`${pageCount} page${pageCount === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }, [item.file.size, pageCount]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`group relative w-[168px] shrink-0 overflow-hidden rounded-2xl border bg-[#14181f] shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition ${
        dragEnabled ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        isDragging
          ? "scale-[1.03] border-teal-300/50 shadow-[0_18px_40px_rgba(0,0,0,0.45)] ring-1 ring-teal-300/30"
          : "border-white/10"
      }`}
      {...(dragEnabled ? { ...attributes, ...listeners } : {})}
    >
      <div className="relative aspect-[3/4] bg-zinc-900">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Preview of ${item.file.name}`}
            className="pointer-events-none h-full w-full object-cover object-top"
            draggable={false}
          />
        )}
        {!loading && (failed || !previewUrl) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
            <FileText className="h-8 w-8" />
            <span className="text-xs">No preview</span>
          </div>
        )}

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          className="absolute right-2 top-2 cursor-pointer rounded-full bg-black/70 p-1.5 text-zinc-200 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/80"
          aria-label={`Remove ${item.file.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-medium text-zinc-200">
          #{index + 1}
        </span>
      </div>

      <div className="space-y-1.5 border-t border-white/5 p-3">
        <p className="truncate text-sm font-medium text-zinc-100" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="text-xs text-zinc-500">{meta}</p>
      </div>
    </article>
  );
}
