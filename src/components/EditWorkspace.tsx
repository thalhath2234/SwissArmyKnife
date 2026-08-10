"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  Italic,
  LoaderCircle,
  PenLine,
  Trash2,
  Type,
  Underline,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import type { UploadedFile } from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import {
  applyEditsToPdf,
  commitTextEdit,
  extractSelectableText,
  fileToPngBytes,
  type EditObject,
  type ExtractedTextSpan,
} from "@/lib/pdf/edit";
import {
  createPageThumbnails,
  createSinglePageThumbnail,
  revokePageThumbnails,
} from "@/lib/pdf/pageThumbs";
import { sanitizeOutputName } from "@/lib/pdf/preview";
import type { ToolDefinition } from "@/lib/tools/catalog";

type Tool = "edit" | "text" | "image" | "cover" | "pan";

type PageItem = {
  sourceIndex: number;
  previewUrl: string;
};

function clampZoom(value: number) {
  return Math.min(3, Math.max(0.4, Number(value.toFixed(3))));
}

function displayFontName(fontName?: string) {
  if (!fontName) return "Helvetica";
  const lower = fontName.toLowerCase();
  if (lower.includes("times")) return "Times";
  if (lower.includes("courier")) return "Courier";
  return "Helvetica";
}

export function EditWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [objects, setObjects] = useState<EditObject[]>([]);
  const [spans, setSpans] = useState<ExtractedTextSpan[]>([]);
  const [editingSpanId, setEditingSpanId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("edit");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("edited.pdf");
  const [color, setColor] = useState("#111827");
  const [zoom, setZoom] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef(1);
  const coverDraft = useRef<{ x: number; y: number } | null>(null);
  const panDrag = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
  } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const drag = useRef<{
    mode: "move" | "resize";
    id: string;
    startX: number;
    startY: number;
    origin: EditObject;
  } | null>(null);
  const skipBlurCommit = useRef(false);

  const current = pages[pageIndex] ?? null;
  const editingSpan =
    spans.find((span) => span.id === editingSpanId && span.pageIndex === pageIndex) ??
    null;
  const selectedObject =
    objects.find((item) => item.id === selectedObjectId) ?? null;
  const pageObjects = useMemo(
    () => objects.filter((item) => item.pageIndex === pageIndex),
    [objects, pageIndex],
  );
  const pageSpans = useMemo(
    () => spans.filter((item) => item.pageIndex === pageIndex),
    [spans, pageIndex],
  );

  const formatTarget = editingSpan
    ? editingSpan
    : selectedObject?.type === "text"
      ? selectedObject
      : null;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const uploaded = files[0];
      if (!uploaded) {
        setPages((currentPages) => {
          revokePageThumbnails(currentPages.map((page) => ({ url: page.previewUrl })));
          return [];
        });
        setSourceBytes(null);
        setObjects([]);
        setSpans([]);
        setEditingSpanId(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await uploaded.file.arrayBuffer());
        const [thumbs, textSpans] = await Promise.all([
          createPageThumbnails(bytes),
          extractSelectableText(bytes),
        ]);
        if (cancelled) {
          revokePageThumbnails(thumbs);
          return;
        }
        setSourceBytes(bytes);
        setSpans(textSpans);
        setObjects([]);
        setEditingSpanId(null);
        setSelectedObjectId(null);
        setPageIndex(0);
        setActiveTool("edit");
        setZoom(1);
        setPages((currentPages) => {
          revokePageThumbnails(currentPages.map((page) => ({ url: page.previewUrl })));
          return thumbs.map((thumb) => ({
            sourceIndex: thumb.sourceIndex,
            previewUrl: thumb.url,
          }));
        });
        setOutputName(
          sanitizeOutputName(`${uploaded.file.name.replace(/\.pdf$/i, "")}-edited`),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [files]);

  useEffect(() => {
    return () => {
      revokePageThumbnails(pages.map((page) => ({ url: page.previewUrl })));
      objects.forEach((object) => {
        if (object.type === "image") URL.revokeObjectURL(object.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const update = () => {
      setStageSize({ width: node.clientWidth, height: node.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [current, zoom, loading]);

  useEffect(() => {
    if (!editingSpanId) return;
    skipBlurCommit.current = true;
    const id = window.setTimeout(() => {
      textInputRef.current?.focus();
      textInputRef.current?.select();
      skipBlurCommit.current = false;
    }, 0);
    return () => window.clearTimeout(id);
  }, [editingSpanId]);

  // Ctrl/Meta + wheel zoom, trackpad pinch (ctrl+wheel), and touch pinch.
  useEffect(() => {
    const scroller = canvasScrollRef.current;
    if (!scroller) return;

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const step = event.deltaMode === 1 ? 0.08 : 0.04;
      setZoom((value) => clampZoom(value + direction * step));
    };

    const touchDistance = (touches: TouchList) => {
      const a = touches[0]!;
      const b = touches[1]!;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinch.current = {
          distance: touchDistance(event.touches),
          zoom: zoomRef.current,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch.current) return;
      event.preventDefault();
      const distance = touchDistance(event.touches);
      const ratio = distance / Math.max(1, pinch.current.distance);
      setZoom(clampZoom(pinch.current.zoom * ratio));
    };

    const onTouchEnd = () => {
      if (!canvasScrollRef.current) return;
      // keep pinch until fewer than 2 touches
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);

    return () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [files.length]);

  function relativePoint(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  }

  async function refreshPagePreview(bytes: Uint8Array, index: number) {
    const thumb = await createSinglePageThumbnail(bytes, index);
    setPages((currentPages) => {
      const prev = currentPages[index];
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return currentPages.map((page, i) =>
        i === index
          ? { sourceIndex: thumb.sourceIndex, previewUrl: thumb.url }
          : page,
      );
    });
  }

  function beginEditSpan(span: ExtractedTextSpan) {
    setSelectedObjectId(null);
    setEditingSpanId(span.id);
    setDraft(span.text);
    setColor(span.color);
    setActiveTool("edit");
  }

  async function commitSpanEdit(options?: { keepEditing?: boolean }) {
    if (!sourceBytes || !editingSpan) {
      setEditingSpanId(null);
      return;
    }

    if (draft === editingSpan.text) {
      if (!options?.keepEditing) setEditingSpanId(null);
      return;
    }

    setCommitting(true);
    setError(null);
    try {
      const result = await commitTextEdit(sourceBytes, {
        pageIndex: editingSpan.pageIndex,
        find: editingSpan.text,
        replace: draft,
      });

      if (!result.ok) {
        // Keep as a drawable fallback object so Done can still rewrite visually.
        const id = crypto.randomUUID();
        setObjects((currentObjects) => [
          ...currentObjects,
          {
            id,
            type: "text-edit",
            pageIndex: editingSpan.pageIndex,
            x: editingSpan.x,
            y: editingSpan.y,
            width: editingSpan.width,
            height: editingSpan.height,
            originalText: editingSpan.text,
            text: draft,
            fontSize: editingSpan.fontSize,
            color: editingSpan.color,
            fontName: editingSpan.fontName,
            sourceSpanId: editingSpan.id,
          },
        ]);
        setError(
          "Stream rewrite missed this run — it will be size/color-matched on Done.",
        );
        setEditingSpanId(null);
        return;
      }

      setSourceBytes(result.bytes);
      await refreshPagePreview(result.bytes, editingSpan.pageIndex);
      const nextSpans = await extractSelectableText(result.bytes);
      setSpans(nextSpans);
      setEditingSpanId(null);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Text edit failed.");
    } finally {
      setCommitting(false);
    }
  }

  function cancelSpanEdit() {
    setEditingSpanId(null);
    setDraft("");
  }

  function onStagePointerDown(event: React.PointerEvent) {
    if (!stageRef.current) return;
    if ((event.target as HTMLElement).closest("[data-edit-hit]")) return;

    if (activeTool === "pan") {
      const scroller = canvasScrollRef.current;
      if (!scroller) return;
      panDrag.current = {
        startX: event.clientX,
        startY: event.clientY,
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
      };
      scroller.setPointerCapture(event.pointerId);
      return;
    }

    const point = relativePoint(event);

    if (activeTool === "text") {
      const id = crypto.randomUUID();
      setObjects((currentObjects) => [
        ...currentObjects,
        {
          id,
          type: "text",
          pageIndex,
          x: point.x,
          y: point.y,
          width: 0.22,
          height: 0.04,
          text: "Type here",
          fontSize: 14,
          color,
        },
      ]);
      setSelectedObjectId(id);
      setEditingSpanId(null);
      setActiveTool("edit");
      return;
    }

    if (activeTool === "image") {
      imageInputRef.current?.click();
      return;
    }

    if (activeTool === "cover") {
      coverDraft.current = point;
      const id = crypto.randomUUID();
      const next: EditObject = {
        id,
        type: "cover",
        pageIndex,
        x: point.x,
        y: point.y,
        width: 0.01,
        height: 0.01,
        color: "#ffffff",
      };
      setObjects((currentObjects) => [...currentObjects, next]);
      setSelectedObjectId(id);
      drag.current = {
        mode: "resize",
        id,
        startX: event.clientX,
        startY: event.clientY,
        origin: next,
      };
      stageRef.current.setPointerCapture(event.pointerId);
      return;
    }

    // Click empty page → commit current text edit.
    if (editingSpanId) {
      void commitSpanEdit();
      return;
    }
    setSelectedObjectId(null);
  }

  function beginDrag(
    event: React.PointerEvent,
    object: EditObject,
    mode: "move" | "resize",
  ) {
    event.stopPropagation();
    event.preventDefault();
    drag.current = {
      mode,
      id: object.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...object },
    };
    setSelectedObjectId(object.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onStagePointerMove(event: React.PointerEvent) {
    if (panDrag.current && canvasScrollRef.current) {
      const dx = event.clientX - panDrag.current.startX;
      const dy = event.clientY - panDrag.current.startY;
      canvasScrollRef.current.scrollLeft = panDrag.current.left - dx;
      canvasScrollRef.current.scrollTop = panDrag.current.top - dy;
      return;
    }

    if (!drag.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = (event.clientX - drag.current.startX) / rect.width;
    const dy = (event.clientY - drag.current.startY) / rect.height;
    const origin = drag.current.origin;
    const id = drag.current.id;

    setObjects((currentObjects) =>
      currentObjects.map((item) => {
        if (item.id !== id) return item;
        if (drag.current?.mode === "move") {
          return {
            ...item,
            x: Math.min(Math.max(origin.x + dx, 0), 1 - origin.width),
            y: Math.min(Math.max(origin.y + dy, 0), 1 - origin.height),
          };
        }
        if (coverDraft.current && item.type === "cover") {
          return {
            ...item,
            x: Math.min(coverDraft.current.x, coverDraft.current.x + dx),
            y: Math.min(coverDraft.current.y, coverDraft.current.y + dy),
            width: Math.max(0.01, Math.abs(dx)),
            height: Math.max(0.01, Math.abs(dy)),
          };
        }
        return {
          ...item,
          width: Math.min(Math.max(origin.width + dx, 0.02), 1 - origin.x),
          height: Math.min(Math.max(origin.height + dy, 0.015), 1 - origin.y),
        };
      }),
    );
  }

  function endDrag() {
    drag.current = null;
    coverDraft.current = null;
    panDrag.current = null;
  }

  async function onImagePicked(file: File | null) {
    if (!file) return;
    const png = await fileToPngBytes(file);
    const previewUrl = URL.createObjectURL(
      new Blob([png.buffer as ArrayBuffer], { type: "image/png" }),
    );
    const id = crypto.randomUUID();
    setObjects((currentObjects) => [
      ...currentObjects,
      {
        id,
        type: "image",
        pageIndex,
        x: 0.2,
        y: 0.2,
        width: 0.35,
        height: 0.25,
        png,
        previewUrl,
      },
    ]);
    setSelectedObjectId(id);
    setActiveTool("edit");
  }

  function deleteSelected() {
    if (editingSpanId) {
      cancelSpanEdit();
      return;
    }
    if (!selectedObjectId) return;
    setObjects((currentObjects) => {
      const target = currentObjects.find((item) => item.id === selectedObjectId);
      if (target?.type === "image") URL.revokeObjectURL(target.previewUrl);
      return currentObjects.filter((item) => item.id !== selectedObjectId);
    });
    setSelectedObjectId(null);
  }

  function updateFormat(patch: { color?: string; fontSize?: number }) {
    if (patch.color) setColor(patch.color);
    if (editingSpan && patch.color) {
      // Color change on existing stream text is applied on Done via fallback object if needed.
      setSpans((currentSpans) =>
        currentSpans.map((span) =>
          span.id === editingSpan.id ? { ...span, color: patch.color! } : span,
        ),
      );
    }
    if (selectedObject?.type === "text") {
      setObjects((currentObjects) =>
        currentObjects.map((item) =>
          item.id === selectedObject.id && item.type === "text"
            ? {
                ...item,
                ...(patch.color ? { color: patch.color } : {}),
                ...(patch.fontSize ? { fontSize: patch.fontSize } : {}),
              }
            : item,
        ),
      );
    }
  }

  async function handleSave() {
    if (!sourceBytes) return;
    setBusy(true);
    setError(null);
    try {
      let working = sourceBytes;
      let pendingObjects = objects;

      if (editingSpan && draft !== editingSpan.text) {
        const result = await commitTextEdit(working, {
          pageIndex: editingSpan.pageIndex,
          find: editingSpan.text,
          replace: draft,
        });
        working = result.bytes;
        if (!result.ok) {
          pendingObjects = [
            ...pendingObjects,
            {
              id: crypto.randomUUID(),
              type: "text-edit",
              pageIndex: editingSpan.pageIndex,
              x: editingSpan.x,
              y: editingSpan.y,
              width: editingSpan.width,
              height: editingSpan.height,
              originalText: editingSpan.text,
              text: draft,
              fontSize: editingSpan.fontSize,
              color: editingSpan.color,
              fontName: editingSpan.fontName,
              sourceSpanId: editingSpan.id,
            },
          ];
        }
        setEditingSpanId(null);
      }

      const output = await applyEditsToPdf(working, pendingObjects);
      downloadBytes(output, sanitizeOutputName(outputName), "application/pdf");
      setSourceBytes(output);
      setObjects(pendingObjects.filter((item) => item.type !== "text-edit"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save edited PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function goToPage(index: number) {
    if (editingSpanId) await commitSpanEdit();
    setPageIndex(index);
    setSelectedObjectId(null);
  }

  if (files.length === 0) {
    return (
      <div className="space-y-6">
        <section className="space-y-5 rounded-3xl border border-white/8 bg-white/[0.03] p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Phase {tool.phase} · local
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-zinc-50">
              {tool.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Click a blue text box and type — edits rewrite the PDF. Pinch or
              Ctrl/⌘ + scroll to zoom.
            </p>
          </div>
          <FileDropzone
            accept="application/pdf,.pdf"
            multiple={false}
            files={files}
            onChange={setFiles}
            label="Drop your PDF Files here"
          />
        </section>
      </div>
    );
  }

  const tools: Array<{ id: Tool; label: string; Icon: typeof Type }> = [
    { id: "pan", label: "Move", Icon: Hand },
    { id: "text", label: "Add Text", Icon: Type },
    { id: "edit", label: "Edit Text", Icon: Underline },
    { id: "cover", label: "Eraser", Icon: Eraser },
    { id: "image", label: "Image", Icon: ImagePlus },
  ];

  return (
    <div className="relative -mx-6 -mt-8 mb-[-2rem] flex min-h-[calc(100vh-4.5rem)] flex-col bg-[#0e1116]">
      <div className="flex items-center gap-3 border-b border-white/8 bg-[#12151c] px-4 py-2.5">
        <button
          type="button"
          onClick={() => setFiles([])}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Replace
        </button>
        <input
          type="text"
          value={outputName.replace(/\.pdf$/i, "")}
          onChange={(event) =>
            setOutputName(sanitizeOutputName(event.target.value, "edited"))
          }
          className="min-w-0 flex-1 truncate bg-transparent text-sm text-zinc-200 outline-none"
        />
        <button
          type="button"
          disabled={busy || loading || !sourceBytes || committing}
          onClick={() => void handleSave()}
          className="rounded-md bg-rose-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Done"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-1 border-b border-white/8 bg-[#161a22] px-3 py-2">
        {tools.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTool(id)}
            className={`flex min-w-[64px] flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[10px] transition ${
              activeTool === id
                ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/40"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <div className="mx-2 hidden h-8 w-px bg-white/10 sm:block" />
        <button
          type="button"
          className="flex min-w-[64px] flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-zinc-600"
          disabled
        >
          <Highlighter className="h-4 w-4" />
          Highlight
        </button>
        <button
          type="button"
          className="flex min-w-[64px] flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-zinc-600"
          disabled
        >
          <PenLine className="h-4 w-4" />
          Pencil
        </button>
      </div>

      {(activeTool === "edit" || formatTarget) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-[#1a1f29] px-4 py-2">
          <label className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/15">
            <span
              className="absolute inset-1 rounded-full"
              style={{ background: formatTarget?.color ?? color }}
            />
            <input
              type="color"
              value={formatTarget?.color ?? color}
              onChange={(event) => updateFormat({ color: event.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>

          <select
            className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-zinc-200 outline-none"
            value={displayFontName(
              editingSpan?.fontName ??
                (selectedObject?.type === "text" ? undefined : undefined),
            )}
            onChange={() => undefined}
          >
            <option>Helvetica</option>
            <option>Times</option>
            <option>Courier</option>
          </select>

          <input
            type="number"
            step="0.01"
            min={4}
            max={96}
            value={
              formatTarget ? Number(formatTarget.fontSize.toFixed(2)) : 12
            }
            disabled={!formatTarget || Boolean(editingSpan)}
            onChange={(event) =>
              updateFormat({ fontSize: Number(event.target.value) || 12 })
            }
            className="h-8 w-20 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-zinc-200 outline-none disabled:opacity-40"
            title={
              editingSpan
                ? "Existing text keeps its PDF font size"
                : "Font size"
            }
          />

          <button
            type="button"
            onClick={() => setBold((value) => !value)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs ${
              bold
                ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
                : "border-white/10 text-zinc-400"
            }`}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setItalic((value) => !value)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs ${
              italic
                ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
                : "border-white/10 text-zinc-400"
            }`}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            {editingSpan && (
              <button
                type="button"
                disabled={committing}
                onClick={() => void commitSpanEdit()}
                className="rounded-md bg-teal-300/90 px-3 py-1.5 text-xs font-medium text-zinc-950 disabled:opacity-40"
              >
                {committing ? "Applying…" : "Apply"}
              </button>
            )}
            <button
              type="button"
              disabled={!editingSpanId && !selectedObjectId}
              onClick={deleteSelected}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:text-rose-300 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="border-b border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-[104px] shrink-0 overflow-y-auto border-r border-white/8 bg-[#12151c] p-2 sm:block">
          {pages.map((page, index) => (
            <button
              key={`${page.previewUrl}-${index}`}
              type="button"
              onClick={() => void goToPage(index)}
              className={`mb-2 block w-full overflow-hidden rounded border bg-white ${
                index === pageIndex
                  ? "border-violet-400 ring-2 ring-violet-400/50"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.previewUrl} alt={`Page ${index + 1}`} className="block w-full" />
              <span className="block bg-[#1a1f29] py-0.5 text-center text-[10px] text-zinc-400">
                {index + 1}
              </span>
            </button>
          ))}
        </aside>

        <div
          ref={canvasScrollRef}
          className={`relative min-w-0 flex-1 overflow-auto bg-[#2a2f3a] ${
            activeTool === "pan" ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          onPointerMove={onStagePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {loading || !current ? (
            <div className="flex h-full items-center justify-center gap-3 text-zinc-400">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Preparing editor…
            </div>
          ) : (
            <div className="flex justify-center p-6 pb-24">
              <div style={{ width: `${Math.round(720 * zoom)}px` }}>
                <div
                  ref={stageRef}
                  className={`relative bg-white shadow-2xl shadow-black/50 ${
                    activeTool === "text"
                      ? "cursor-text"
                      : activeTool === "cover"
                        ? "cursor-crosshair"
                        : activeTool === "image"
                          ? "cursor-copy"
                          : activeTool === "pan"
                            ? "cursor-grab"
                            : "cursor-default"
                  }`}
                  onPointerDown={onStagePointerDown}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.previewUrl}
                    alt={`Page ${pageIndex + 1}`}
                    className="pointer-events-none block w-full select-none"
                    draggable={false}
                  />

                  {activeTool === "edit" &&
                    pageSpans.map((span) => {
                      const isEditing = span.id === editingSpanId;
                      const fontPx = Math.max(
                        7,
                        stageSize.height * span.height * 0.9,
                      );

                      if (isEditing) {
                        return (
                          <div
                            key={span.id}
                            data-edit-hit
                            className="absolute z-30 outline outline-2 outline-[#4da3ff]"
                            style={{
                              left: `${span.x * 100}%`,
                              top: `${span.y * 100}%`,
                              width: `${Math.max(span.width, 0.04) * 100}%`,
                              height: `${Math.max(span.height, 0.012) * 100}%`,
                              background: "#ffffff",
                            }}
                          >
                            <textarea
                              ref={textInputRef}
                              value={draft}
                              spellCheck={false}
                              onChange={(event) => setDraft(event.target.value)}
                              onMouseDown={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                              onBlur={() => {
                                if (skipBlurCommit.current) return;
                                void commitSpanEdit();
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  void commitSpanEdit();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelSpanEdit();
                                }
                              }}
                              className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 leading-none outline-none"
                              style={{
                                color: span.color,
                                fontSize: `${fontPx}px`,
                                fontFamily: "Helvetica, Arial, sans-serif",
                                fontWeight: bold ? 700 : 400,
                                fontStyle: italic ? "italic" : "normal",
                                lineHeight: 1,
                                caretColor: span.color,
                              }}
                            />
                          </div>
                        );
                      }

                      return (
                        <button
                          key={span.id}
                          type="button"
                          data-edit-hit
                          title={`Edit: ${span.text.slice(0, 40)}`}
                          className="absolute z-10 border border-[#4da3ff] bg-[#4da3ff]/0 hover:bg-[#4da3ff]/15"
                          style={{
                            left: `${span.x * 100}%`,
                            top: `${span.y * 100}%`,
                            width: `${span.width * 100}%`,
                            height: `${span.height * 100}%`,
                          }}
                          onMouseDown={(event) => {
                            // Prevent stage from stealing the interaction.
                            event.preventDefault();
                            event.stopPropagation();
                            if (editingSpanId && editingSpanId !== span.id) {
                              void commitSpanEdit().then(() => beginEditSpan(span));
                              return;
                            }
                            beginEditSpan(span);
                          }}
                        />
                      );
                    })}

                  {pageObjects.map((object) => {
                    const isSelected = object.id === selectedObjectId;
                    return (
                      <div
                        key={object.id}
                        data-edit-hit
                        className={`absolute touch-none ${
                          isSelected
                            ? "z-20 outline outline-2 outline-[#4da3ff]"
                            : "outline outline-1 outline-[#4da3ff]/70"
                        }`}
                        style={{
                          left: `${object.x * 100}%`,
                          top: `${object.y * 100}%`,
                          width: `${object.width * 100}%`,
                          height: `${object.height * 100}%`,
                          background:
                            object.type === "cover" ? object.color : "transparent",
                        }}
                        onPointerDown={(event) => {
                          if ((event.target as HTMLElement).closest("textarea")) {
                            setSelectedObjectId(object.id);
                            return;
                          }
                          beginDrag(event, object, "move");
                        }}
                      >
                        {object.type === "text" || object.type === "text-edit" ? (
                          <textarea
                            value={object.text}
                            spellCheck={false}
                            onChange={(event) =>
                              setObjects((currentObjects) =>
                                currentObjects.map((item) =>
                                  item.id === object.id &&
                                  (item.type === "text" || item.type === "text-edit")
                                    ? { ...item, text: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            onPointerDown={(event) => event.stopPropagation()}
                            className="h-full w-full resize-none border-0 bg-white p-0 leading-none outline-none"
                            style={{
                              color: object.color,
                              fontSize: `${Math.max(8, stageSize.height * object.height * 0.88)}px`,
                              fontFamily: "Helvetica, Arial, sans-serif",
                            }}
                          />
                        ) : object.type === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={object.previewUrl}
                            alt=""
                            className="h-full w-full object-contain"
                            draggable={false}
                          />
                        ) : null}
                        {isSelected && object.type !== "text-edit" && (
                          <button
                            type="button"
                            aria-label="Resize"
                            data-edit-hit
                            className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-full border-2 border-white bg-[#4da3ff]"
                            onPointerDown={(event) =>
                              beginDrag(event, object, "resize")
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#1a1f29]/95 px-2 py-1.5 shadow-xl backdrop-blur">
              <button
                type="button"
                disabled={pageIndex <= 0}
                onClick={() => void goToPage(pageIndex - 1)}
                className="rounded-full p-1.5 text-zinc-300 hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[72px] text-center text-xs text-zinc-300">
                Page: {pageIndex + 1} / {pages.length || 1}
              </span>
              <button
                type="button"
                disabled={pageIndex >= pages.length - 1}
                onClick={() => void goToPage(pageIndex + 1)}
                className="rounded-full p-1.5 text-zinc-300 hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="mx-1 h-4 w-px bg-white/15" />
              <button
                type="button"
                onClick={() => setZoom((value) => clampZoom(value - 0.1))}
                className="rounded-full p-1.5 text-zinc-300 hover:bg-white/10"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-10 text-center text-xs text-zinc-400">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((value) => clampZoom(value + 0.1))}
                className="rounded-full p-1.5 text-zinc-300 hover:bg-white/10"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="mx-1 h-4 w-px bg-white/15" />
              <button
                type="button"
                onClick={() => setActiveTool("pan")}
                className={`rounded-full p-1.5 ${
                  activeTool === "pan"
                    ? "bg-white/15 text-zinc-100"
                    : "text-zinc-300 hover:bg-white/10"
                }`}
              >
                <Hand className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => void onImagePicked(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
