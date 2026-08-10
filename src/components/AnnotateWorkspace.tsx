"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  LoaderCircle,
  PenLine,
  Trash2,
  Type,
} from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import type { UploadedFile } from "@/lib/files/uploaded";
import {
  applyAnnotationsToPdf,
  type Annotation,
} from "@/lib/pdf/annotate";
import { downloadBytes } from "@/lib/pdf/download";
import {
  createPageThumbnails,
  revokePageThumbnails,
} from "@/lib/pdf/pageThumbs";
import { sanitizeOutputName } from "@/lib/pdf/preview";
import type { ToolDefinition } from "@/lib/tools/catalog";

type Tool = "highlight" | "pen" | "text";

type PageItem = {
  sourceIndex: number;
  previewUrl: string;
};

const COLORS = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#f87171", "#111827"];

export function AnnotateWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>("highlight");
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("annotated.pdf");
  const [draftText, setDraftText] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const strokeId = useRef<string | null>(null);
  const highlightStart = useRef<{ x: number; y: number } | null>(null);

  const current = pages[pageIndex] ?? null;
  const pageAnnotations = annotations.filter((item) => item.pageIndex === pageIndex);

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
        setAnnotations([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await uploaded.file.arrayBuffer());
        const thumbs = await createPageThumbnails(bytes);
        if (cancelled) {
          revokePageThumbnails(thumbs);
          return;
        }
        setSourceBytes(bytes);
        setAnnotations([]);
        setPageIndex(0);
        setPages((currentPages) => {
          revokePageThumbnails(currentPages.map((page) => ({ url: page.previewUrl })));
          return thumbs.map((thumb) => ({
            sourceIndex: thumb.sourceIndex,
            previewUrl: thumb.url,
          }));
        });
        setOutputName(
          sanitizeOutputName(`${uploaded.file.name.replace(/\.pdf$/i, "")}-annotated`),
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function relativePoint(event: React.PointerEvent) {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  }

  function onPointerDown(event: React.PointerEvent) {
    if (!stageRef.current) return;
    const point = relativePoint(event);

    if (activeTool === "text") {
      if (!draftText.trim()) {
        setError("Type a note first, then click the page to place it.");
        return;
      }
      setAnnotations((currentAnnotations) => [
        ...currentAnnotations,
        {
          id: crypto.randomUUID(),
          type: "text",
          pageIndex,
          x: point.x,
          y: point.y,
          text: draftText.trim(),
          color,
        },
      ]);
      setError(null);
      return;
    }

    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (activeTool === "pen") {
      const id = crypto.randomUUID();
      strokeId.current = id;
      setAnnotations((currentAnnotations) => [
        ...currentAnnotations,
        {
          id,
          type: "stroke",
          pageIndex,
          points: [point],
          color,
          lineWidth: 0.004,
        },
      ]);
      return;
    }

    highlightStart.current = point;
    const id = crypto.randomUUID();
    strokeId.current = id;
    setAnnotations((currentAnnotations) => [
      ...currentAnnotations,
      {
        id,
        type: "highlight",
        pageIndex,
        x: point.x,
        y: point.y,
        width: 0.01,
        height: 0.01,
        color,
      },
    ]);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drawing.current || !strokeId.current) return;
    const point = relativePoint(event);
    const id = strokeId.current;

    if (activeTool === "pen") {
      setAnnotations((currentAnnotations) =>
        currentAnnotations.map((item) =>
          item.id === id && item.type === "stroke"
            ? { ...item, points: [...item.points, point] }
            : item,
        ),
      );
      return;
    }

    if (activeTool === "highlight" && highlightStart.current) {
      const start = highlightStart.current;
      const x = Math.min(start.x, point.x);
      const y = Math.min(start.y, point.y);
      const width = Math.abs(point.x - start.x);
      const height = Math.abs(point.y - start.y);
      setAnnotations((currentAnnotations) =>
        currentAnnotations.map((item) =>
          item.id === id && item.type === "highlight"
            ? { ...item, x, y, width, height }
            : item,
        ),
      );
    }
  }

  function onPointerUp() {
    drawing.current = false;
    strokeId.current = null;
    highlightStart.current = null;
  }

  async function handleSave() {
    if (!sourceBytes) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await applyAnnotationsToPdf(sourceBytes, annotations);
      downloadBytes(bytes, sanitizeOutputName(outputName), "application/pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save annotations.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-3xl border border-white/8 bg-white/[0.03] p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Phase {tool.phase} · {tool.mode}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-zinc-50">
            {tool.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Highlight, draw, or place text notes on pages, then download the marked-up PDF.
          </p>
        </div>

        <FileDropzone
          accept="application/pdf,.pdf"
          multiple={false}
          files={files}
          onChange={setFiles}
          label="Drop your PDF File here"
        />

        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["highlight", Highlighter, "Highlight"],
                ["pen", PenLine, "Draw"],
                ["text", Type, "Text"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTool(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                  activeTool === id
                    ? "bg-teal-300 text-zinc-950"
                    : "border border-white/10 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}

            <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1">
              {COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={`h-4 w-4 rounded-full ${
                    color === swatch ? "ring-2 ring-white/70 ring-offset-1 ring-offset-zinc-900" : ""
                  }`}
                  style={{ backgroundColor: swatch }}
                  aria-label={`Color ${swatch}`}
                />
              ))}
            </div>

            {activeTool === "text" && (
              <input
                type="text"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                placeholder="Note text, then click page"
                className="min-w-[200px] flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-teal-300/40"
              />
            )}

            <button
              type="button"
              onClick={() =>
                setAnnotations((currentAnnotations) =>
                  currentAnnotations.filter((item) => item.pageIndex !== pageIndex),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-rose-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear page
            </button>

            <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
              Name
              <input
                type="text"
                value={outputName.replace(/\.pdf$/i, "")}
                onChange={(event) =>
                  setOutputName(sanitizeOutputName(event.target.value, "annotated"))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none"
              />
            </label>

            <button
              type="button"
              disabled={busy || loading || !sourceBytes}
              onClick={handleSave}
              className="rounded-full bg-teal-300 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Download annotated PDF"}
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}
      </section>

      {files.length > 0 && (
        <section className="rounded-3xl border border-white/8 bg-black/25 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-zinc-100">
              Canvas
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
                className="rounded-full border border-white/10 p-2 text-zinc-300 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-zinc-500">
                Page {pageIndex + 1} / {pages.length || 1} · {pageAnnotations.length} marks
              </span>
              <button
                type="button"
                disabled={pageIndex >= pages.length - 1}
                onClick={() =>
                  setPageIndex((value) => Math.min(pages.length - 1, value + 1))
                }
                className="rounded-full border border-white/10 p-2 text-zinc-300 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading || !current ? (
            <div className="flex items-center justify-center gap-3 py-20 text-zinc-400">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Loading page…
            </div>
          ) : (
            <div
              ref={stageRef}
              className="relative mx-auto max-w-3xl touch-none overflow-hidden rounded-2xl border border-white/10 bg-zinc-900"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.previewUrl}
                alt={`Page ${pageIndex + 1}`}
                className="pointer-events-none block w-full select-none"
                draggable={false}
              />

              {pageAnnotations.map((annotation) => {
                if (annotation.type === "highlight") {
                  return (
                    <div
                      key={annotation.id}
                      className="pointer-events-none absolute"
                      style={{
                        left: `${annotation.x * 100}%`,
                        top: `${annotation.y * 100}%`,
                        width: `${annotation.width * 100}%`,
                        height: `${annotation.height * 100}%`,
                        backgroundColor: annotation.color,
                        opacity: 0.35,
                      }}
                    />
                  );
                }
                if (annotation.type === "text") {
                  return (
                    <div
                      key={annotation.id}
                      className="pointer-events-none absolute max-w-[45%] text-sm font-medium"
                      style={{
                        left: `${annotation.x * 100}%`,
                        top: `${annotation.y * 100}%`,
                        color: annotation.color,
                      }}
                    >
                      {annotation.text}
                    </div>
                  );
                }
                if (annotation.type === "stroke" && annotation.points.length > 1) {
                  const d = annotation.points
                    .map((point, index) =>
                      `${index === 0 ? "M" : "L"} ${point.x * 1000} ${point.y * 1000}`,
                    )
                    .join(" ");
                  return (
                    <svg
                      key={annotation.id}
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                    >
                      <path
                        d={d}
                        fill="none"
                        stroke={annotation.color}
                        strokeWidth={annotation.lineWidth * 1000}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                }
                return null;
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
