"use client";

import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileText, Plus, Upload } from "lucide-react";
import { SortableFileCard } from "@/components/SortableFileCard";
import {
  replaceUploadedFiles,
  toUploadedFiles,
  type UploadedFile,
} from "@/lib/files/uploaded";
import { createFilePreview } from "@/lib/pdf/preview";

interface FileDropzoneProps {
  accept: string;
  multiple?: boolean;
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  label?: string;
}

export function FileDropzone({
  accept,
  multiple = false,
  files,
  onChange,
  label = "Drop your PDF Files here",
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overlayPreview, setOverlayPreview] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      if (multiple) onChange(toUploadedFiles(list, files));
      else onChange(replaceUploadedFiles(list));
      if (inputRef.current) inputRef.current.value = "";
    },
    [files, multiple, onChange],
  );

  const activeItem = files.find((item) => item.id === activeId) ?? null;

  async function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    const item = files.find((entry) => entry.id === id);
    if (!item) return;
    try {
      const preview = await createFilePreview(item.file);
      setOverlayPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return preview.url;
      });
    } catch {
      setOverlayPreview(null);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverlayPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (!over || active.id === over.id) return;
    const oldIndex = files.findIndex((item) => item.id === active.id);
    const newIndex = files.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(files, oldIndex, newIndex));
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition ${
          dragging
            ? "border-teal-300/60 bg-teal-400/10"
            : "border-white/15 bg-white/[0.02] hover:border-white/30"
        }`}
      >
        <Upload className="h-5 w-5 text-teal-300" />
        <div>
          <p className="text-sm text-zinc-200">{label}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Size up to 100 MB · drag cards left/right to reorder
          </p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(event) => handleFiles(event.target.files)}
      />

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">
              {files.length} file{files.length === 1 ? "" : "s"} · drag to arrange order
            </p>
            {multiple && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300 transition hover:border-teal-300/40 hover:text-teal-200"
              >
                <Plus className="h-3.5 w-3.5" />
                Add more
              </button>
            )}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActiveId(null);
              setOverlayPreview((current) => {
                if (current) URL.revokeObjectURL(current);
                return null;
              });
            }}
          >
            <SortableContext
              items={files.map((item) => item.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-3 overflow-x-auto pb-2 pt-1 [scrollbar-width:thin]">
                {files.map((item, index) => (
                  <SortableFileCard
                    key={item.id}
                    item={item}
                    index={index}
                    dragEnabled={multiple && files.length > 1}
                    onRemove={() => onChange(files.filter((entry) => entry.id !== item.id))}
                  />
                ))}

                {multiple && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex h-auto w-[168px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] text-zinc-400 transition hover:border-teal-300/40 hover:text-teal-200"
                  >
                    <Plus className="h-5 w-5" />
                    <span className="text-xs">Add file</span>
                  </button>
                )}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeItem ? (
                <div className="w-[168px] overflow-hidden rounded-2xl border border-teal-300/40 bg-[#14181f] shadow-2xl ring-1 ring-teal-300/20">
                  <div className="aspect-[3/4] bg-zinc-900">
                    {overlayPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={overlayPreview}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-500">
                        <FileText className="h-6 w-6 opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="border-t border-white/5 p-3">
                    <p className="truncate text-sm text-zinc-100">{activeItem.file.name}</p>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}
