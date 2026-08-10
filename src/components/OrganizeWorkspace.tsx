"use client";

import { useEffect, useMemo, useState } from "react";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { LoaderCircle } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { PagePeekModal } from "@/components/PagePeekModal";
import {
  SortablePageCard,
  type OrganizablePage,
} from "@/components/SortablePageCard";
import type { UploadedFile } from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import { buildOrganizedPdf } from "@/lib/pdf/organize";
import {
  createPageThumbnails,
  revokePageThumbnails,
} from "@/lib/pdf/pageThumbs";
import { sanitizeOutputName } from "@/lib/pdf/preview";
import type { ToolDefinition } from "@/lib/tools/catalog";

type OrganizeMode = "organize" | "extract" | "delete" | "rotate";

function modeFromSlug(slug: string): OrganizeMode {
  if (slug === "extract-pages") return "extract";
  if (slug === "delete-pages") return "delete";
  if (slug === "rotate-pdf") return "rotate";
  return "organize";
}

export function OrganizeWorkspace({ tool }: { tool: ToolDefinition }) {
  const mode = modeFromSlug(tool.slug);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pages, setPages] = useState<OrganizablePage[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [outputName, setOutputName] = useState("organized.pdf");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [separateFiles, setSeparateFiles] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const activePage = pages.find((page) => page.id === activeId) ?? null;
  const peekPage = pages.find((page) => page.id === peekId) ?? null;
  const peekIndex = peekPage
    ? pages.findIndex((page) => page.id === peekPage.id)
    : -1;
  const selectedCount = pages.filter((page) => page.selected).length;

  const ctaLabel = useMemo(() => {
    if (mode === "extract") return "Extract Selected Pages";
    if (mode === "delete") return "Delete Selected Pages";
    if (mode === "rotate") return "Save Rotated PDF";
    return "Save Organized PDF";
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const uploaded = files[0];
      if (!uploaded) {
        setPages((current) => {
          revokePageThumbnails(current.map((page) => ({ url: page.previewUrl })));
          return [];
        });
        setSourceBytes(null);
        return;
      }

      setLoading(true);
      setError(null);
      setProgress({ done: 0, total: 0 });

      try {
        const bytes = new Uint8Array(await uploaded.file.arrayBuffer());
        const thumbs = await createPageThumbnails(bytes, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        if (cancelled) {
          revokePageThumbnails(thumbs);
          return;
        }

        setSourceBytes(bytes);
        setPages((current) => {
          revokePageThumbnails(current.map((page) => ({ url: page.previewUrl })));
          return thumbs.map((thumb) => ({
            id: `page-${thumb.sourceIndex}-${crypto.randomUUID()}`,
            sourceIndex: thumb.sourceIndex,
            rotation: 0,
            selected: mode === "extract" || mode === "delete" ? false : true,
            previewUrl: thumb.url,
          }));
        });
        setOutputName(
          sanitizeOutputName(
            `${uploaded.file.name.replace(/\.pdf$/i, "")}-${mode === "extract" ? "extract" : mode === "delete" ? "trimmed" : mode === "rotate" ? "rotated" : "organized"}`,
          ),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF pages.");
          setPages([]);
          setSourceBytes(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [files, mode]);

  useEffect(() => {
    return () => {
      revokePageThumbnails(pages.map((page) => ({ url: page.previewUrl })));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    setPages((current) => {
      const oldIndex = current.findIndex((page) => page.id === active.id);
      const newIndex = current.findIndex((page) => page.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  function rotatePage(id: string) {
    setPages((current) =>
      current.map((page) =>
        page.id === id ? { ...page, rotation: (page.rotation + 90) % 360 } : page,
      ),
    );
  }

  function deletePage(id: string) {
    setPages((current) => {
      if (current.length <= 1) {
        setError("Keep at least one page in the document.");
        return current;
      }
      return current.filter((page) => page.id !== id);
    });
  }

  function toggleSelect(id: string) {
    setPages((current) =>
      current.map((page) =>
        page.id === id ? { ...page, selected: !page.selected } : page,
      ),
    );
  }

  function selectAll(value: boolean) {
    setPages((current) => current.map((page) => ({ ...page, selected: value })));
  }

  async function handleSave() {
    if (!sourceBytes) return;
    setBusy(true);
    setError(null);
    try {
      let ops = pages.map((page) => ({
        sourceIndex: page.sourceIndex,
        rotation: page.rotation,
      }));

      if (mode === "extract") {
        const selected = pages.filter((page) => page.selected);
        if (selected.length === 0) {
          throw new Error("Select at least one page to extract.");
        }
        ops = selected.map((page) => ({
          sourceIndex: page.sourceIndex,
          rotation: page.rotation,
        }));

        if (separateFiles) {
          const base = sanitizeOutputName(outputName).replace(/\.pdf$/i, "");
          for (const [index, page] of selected.entries()) {
            const bytes = await buildOrganizedPdf(sourceBytes, [
              { sourceIndex: page.sourceIndex, rotation: page.rotation },
            ]);
            downloadBytes(
              bytes,
              `${base}-page-${index + 1}.pdf`,
              "application/pdf",
            );
          }
          return;
        }
      }

      if (mode === "delete") {
        const remaining = pages.filter((page) => !page.selected);
        if (remaining.length === 0) {
          throw new Error("Select pages to delete, and keep at least one page.");
        }
        if (selectedCount === 0) {
          throw new Error("Select at least one page to delete.");
        }
        ops = remaining.map((page) => ({
          sourceIndex: page.sourceIndex,
          rotation: page.rotation,
        }));
      }

      const bytes = await buildOrganizedPdf(sourceBytes, ops);
      downloadBytes(bytes, sanitizeOutputName(outputName), "application/pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save PDF.");
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
            {tool.description} Drag page thumbnails to reorder. Hover a page for
            rotate{mode !== "extract" ? " and delete" : ""}.
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
          <div className="flex flex-wrap items-end gap-4">
            <label className="block min-w-[220px] flex-1 space-y-1.5 text-sm text-zinc-400">
              Output file name
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={outputName.replace(/\.pdf$/i, "")}
                  onChange={(event) =>
                    setOutputName(sanitizeOutputName(event.target.value, "organized"))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none focus:border-teal-300/40"
                />
                <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-zinc-500">
                  .pdf
                </span>
              </div>
            </label>

            {(mode === "extract" || mode === "delete") && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectAll(true)}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:border-white/25"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => selectAll(false)}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:border-white/25"
                >
                  Clear
                </button>
              </div>
            )}

            {mode === "extract" && (
              <button
                type="button"
                onClick={() => setSeparateFiles((value) => !value)}
                className={`rounded-full px-3 py-2 text-xs transition ${
                  separateFiles
                    ? "bg-teal-400/20 text-teal-200 ring-1 ring-teal-300/40"
                    : "border border-white/10 text-zinc-300 hover:border-white/25"
                }`}
              >
                Separate PDFs
              </button>
            )}

            <button
              type="button"
              disabled={busy || loading || pages.length === 0}
              onClick={handleSave}
              className="rounded-full bg-teal-300 px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving…" : ctaLabel}
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-zinc-100">
              Pages
            </h2>
            <p className="text-xs text-zinc-500">
              {loading
                ? `Rendering ${progress.done}/${progress.total || "…"}`
                : `${pages.length} page${pages.length === 1 ? "" : "s"}${
                    mode === "extract" || mode === "delete"
                      ? ` · ${selectedCount} selected`
                      : ""
                  }`}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-zinc-400">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Building page previews…
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={pages.map((page) => page.id)} strategy={rectSortingStrategy}>
                <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {pages.map((page, index) => (
                    <SortablePageCard
                      key={page.id}
                      page={page}
                      index={index}
                      selectable={mode === "extract" || mode === "delete"}
                      showDelete={mode === "organize" || mode === "delete" || mode === "rotate"}
                      onToggleSelect={() => toggleSelect(page.id)}
                      onRotate={() => rotatePage(page.id)}
                      onDelete={() => deletePage(page.id)}
                      onPeek={() => setPeekId(page.id)}
                    />
                  ))}
                </div>
              </SortableContext>

              <DragOverlay>
                {activePage ? (
                  <div className="w-[160px] overflow-hidden rounded-2xl border border-teal-300/40 bg-[#14181f] shadow-2xl">
                    <div className="aspect-[3/4] bg-zinc-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activePage.previewUrl}
                        alt=""
                        className="h-full w-full object-contain"
                        style={{ transform: `rotate(${activePage.rotation}deg)` }}
                      />
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </section>
      )}

      <PagePeekModal
        open={Boolean(peekPage)}
        placeholderUrl={peekPage?.previewUrl ?? null}
        sourceBytes={sourceBytes}
        sourceIndex={peekPage?.sourceIndex ?? 0}
        label={
          peekPage
            ? `Page ${peekIndex + 1} of ${pages.length}`
            : undefined
        }
        rotation={peekPage?.rotation ?? 0}
        hasPrev={peekIndex > 0}
        hasNext={peekIndex >= 0 && peekIndex < pages.length - 1}
        onPrev={() => {
          if (peekIndex > 0) setPeekId(pages[peekIndex - 1].id);
        }}
        onNext={() => {
          if (peekIndex >= 0 && peekIndex < pages.length - 1) {
            setPeekId(pages[peekIndex + 1].id);
          }
        }}
        onClose={() => setPeekId(null)}
      />
    </div>
  );
}
