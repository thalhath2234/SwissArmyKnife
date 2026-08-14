"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FilePlus2,
  Info,
  LoaderCircle,
  RotateCw,
  Scissors,
  SquareStack,
  Trash2,
} from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { PagePeekModal } from "@/components/PagePeekModal";
import {
  toUploadedFiles,
  type UploadedFile,
} from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import { buildPdfFromMultiSource } from "@/lib/pdf/multiSource";
import {
  createPageThumbnails,
  revokePageThumbnails,
} from "@/lib/pdf/pageThumbs";
import { sanitizeOutputName } from "@/lib/pdf/preview";
import {
  SPLIT_COLORS,
  buildGroupsFromSplits,
  groupIndexForPage,
  splitsEveryNPages,
  toggleSplitAfter,
} from "@/lib/pdf/splitGroups";
import type { ToolDefinition } from "@/lib/tools/catalog";

type WorkspacePage = {
  id: string;
  fileId: string;
  fileName: string;
  sourceIndex: number;
  rotation: number;
  selected: boolean;
  previewUrl: string;
};

type Mode = "split" | "extract";

export function SplitWorkspace({
  tool,
  initialMode,
}: {
  tool: ToolDefinition;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(
    initialMode ?? (tool.slug === "extract-pages" ? "extract" : "split"),
  );
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [sources, setSources] = useState<Map<string, Uint8Array>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitAfter, setSplitAfter] = useState<Set<number>>(new Set());
  const [everyN, setEveryN] = useState(1);
  const [useEveryN, setUseEveryN] = useState(false);
  const [separateFiles, setSeparateFiles] = useState(true);
  const [outputName, setOutputName] = useState("split");
  const [groupNames, setGroupNames] = useState<Record<number, string>>({});
  const [peekId, setPeekId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const loadToken = useRef(0);

  const groups = useMemo(
    () => buildGroupsFromSplits(pages.length, splitAfter),
    [pages.length, splitAfter],
  );

  const namedGroups = useMemo(() => {
    const prefix = outputName.trim() || "split";
    return groups.map((indexes, groupIndex) => {
      const start = indexes[0] ?? 0;
      const end = indexes[indexes.length - 1] ?? start;
      const fallback = `${prefix}-part-${groupIndex + 1}`;
      const name = groupNames[start]?.trim() || fallback;
      return { indexes, groupIndex, start, end, name };
    });
  }, [groups, groupNames, outputName]);

  const peekPage = pages.find((page) => page.id === peekId) ?? null;
  const peekIndex = peekPage
    ? pages.findIndex((page) => page.id === peekPage.id)
    : -1;
  const selectedCount = pages.filter((page) => page.selected).length;

  const statusText = useMemo(() => {
    if (mode === "split") {
      const count = Math.max(groups.length, pages.length ? 1 : 0);
      return `${count} PDF${count === 1 ? "" : "s"} will be created`;
    }
    if (separateFiles) {
      return `${selectedCount} PDF${selectedCount === 1 ? "" : "s"} will be created`;
    }
    return selectedCount > 0 ? "1 PDF will be created" : "Select pages to extract";
  }, [mode, groups.length, pages.length, separateFiles, selectedCount]);

  useEffect(() => {
    if (!useEveryN) return;
    setSplitAfter(splitsEveryNPages(pages.length, everyN));
  }, [useEveryN, everyN, pages.length]);

  useEffect(() => {
    return () => {
      revokePageThumbnails(pages.map((page) => ({ url: page.previewUrl })));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFiles(nextFiles: UploadedFile[], append: boolean) {
    const token = ++loadToken.current;
    setLoading(true);
    setError(null);
    setProgress({ done: 0, total: 0 });

    try {
      if (!append) {
        setFiles(nextFiles);
        revokePageThumbnails(pages.map((page) => ({ url: page.previewUrl })));
        setSplitAfter(new Set());
        setGroupNames({});
        setPages([]);
      }

      const nextSources = append ? new Map(sources) : new Map<string, Uint8Array>();
      const built: WorkspacePage[] = append ? [...pages] : [];

      let rendered = 0;
      const totalEstimate = nextFiles.length;

      for (const uploaded of nextFiles) {
        if (append && sources.has(uploaded.id)) continue;

        const bytes = new Uint8Array(await uploaded.file.arrayBuffer());
        nextSources.set(uploaded.id, bytes);
        const thumbs = await createPageThumbnails(bytes, (done, total) => {
          if (loadToken.current !== token) return;
          setProgress({
            done: rendered + done,
            total: Math.max(totalEstimate * total, rendered + total),
          });
        });

        if (loadToken.current !== token) {
          revokePageThumbnails(thumbs);
          return;
        }

        for (const thumb of thumbs) {
          built.push({
            id: `${uploaded.id}-${thumb.sourceIndex}-${crypto.randomUUID()}`,
            fileId: uploaded.id,
            fileName: uploaded.file.name,
            sourceIndex: thumb.sourceIndex,
            rotation: 0,
            selected: false,
            previewUrl: thumb.url,
          });
        }
        rendered += thumbs.length;
      }

      if (loadToken.current !== token) return;

      setSources(nextSources);
      setPages(built);
      if (append) {
        setFiles((current) => {
          const ids = new Set(current.map((item) => item.id));
          return [...current, ...nextFiles.filter((item) => !ids.has(item.id))];
        });
      }

      if (!append && nextFiles[0]) {
        setOutputName(
          sanitizeOutputName(
            `${nextFiles[0].file.name.replace(/\.pdf$/i, "")}-${mode}`,
            mode,
          ).replace(/\.pdf$/i, ""),
        );
      }
    } catch (err) {
      if (loadToken.current === token) {
        setError(err instanceof Error ? err.message : "Failed to load PDF pages.");
      }
    } finally {
      if (loadToken.current === token) setLoading(false);
    }
  }

  function handleDropzoneChange(next: UploadedFile[]) {
    void loadFiles(next, false);
  }

  function handleAddFiles(list: FileList | null) {
    if (!list?.length) return;
    const uploaded = toUploadedFiles(list);
    void loadFiles(uploaded, files.length > 0);
    if (addInputRef.current) addInputRef.current.value = "";
  }

  function rotateSelectedOrAll() {
    setPages((current) => {
      const anySelected = current.some((page) => page.selected);
      return current.map((page) =>
        !anySelected || page.selected
          ? { ...page, rotation: (page.rotation + 90) % 360 }
          : page,
      );
    });
  }

  function rotateOne(id: string) {
    setPages((current) =>
      current.map((page) =>
        page.id === id ? { ...page, rotation: (page.rotation + 90) % 360 } : page,
      ),
    );
  }

  function deleteOne(id: string) {
    setPages((current) => {
      if (current.length <= 1) {
        setError("Keep at least one page.");
        return current;
      }
      const index = current.findIndex((page) => page.id === id);
      const next = current.filter((page) => page.id !== id);
      setSplitAfter((splits) => {
        const remapped = new Set<number>();
        splits.forEach((splitIndex) => {
          if (splitIndex < index) remapped.add(splitIndex);
          else if (splitIndex > index) remapped.add(splitIndex - 1);
        });
        return remapped;
      });
      const removed = current.find((page) => page.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  function uniqueFileName(name: string, used: Set<string>): string {
    const sanitized = sanitizeOutputName(name, "part");
    const base = sanitized.replace(/\.pdf$/i, "");
    let candidate = `${base}.pdf`;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}-${suffix}.pdf`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  async function buildGroupPdf(indexes: number[]) {
    return buildPdfFromMultiSource(
      indexes.map((pageIndex) => {
        const page = pages[pageIndex];
        return {
          fileId: page.fileId,
          sourceIndex: page.sourceIndex,
          rotation: page.rotation,
        };
      }),
      sources,
    );
  }

  async function extractGroup(groupIndex: number) {
    const group = namedGroups[groupIndex];
    if (!group || pages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildGroupPdf(group.indexes);
      downloadBytes(
        bytes,
        uniqueFileName(group.name, new Set()),
        "application/pdf",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not extract this split.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction() {
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const base = outputName.trim() || mode;

      if (mode === "split") {
        const parts = namedGroups.length
          ? namedGroups
          : [
              {
                indexes: pages.map((_, i) => i),
                name: outputName.trim() || "split",
              },
            ];
        const used = new Set<string>();
        for (const group of parts) {
          const bytes = await buildGroupPdf(group.indexes);
          downloadBytes(
            bytes,
            uniqueFileName(group.name, used),
            "application/pdf",
          );
        }
        return;
      }

      const selected = pages.filter((page) => page.selected);
      if (selected.length === 0) {
        throw new Error("Select at least one page to extract.");
      }

      if (separateFiles) {
        for (const [index, page] of selected.entries()) {
          const bytes = await buildPdfFromMultiSource(
            [
              {
                fileId: page.fileId,
                sourceIndex: page.sourceIndex,
                rotation: page.rotation,
              },
            ],
            sources,
          );
          downloadBytes(bytes, `${base}-page-${index + 1}.pdf`, "application/pdf");
        }
      } else {
        const bytes = await buildPdfFromMultiSource(
          selected.map((page) => ({
            fileId: page.fileId,
            sourceIndex: page.sourceIndex,
            rotation: page.rotation,
          })),
          sources,
        );
        downloadBytes(bytes, `${base}.pdf`, "application/pdf");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process PDF.");
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
            {mode === "split" ? "Split PDF" : "Extract Pages"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {mode === "split"
              ? "Click between pages to add colored split points. Name each group, then extract one split or download them all."
              : "Select the pages you want, then extract into one PDF or separate files."}
          </p>
        </div>

        {files.length === 0 ? (
          <FileDropzone
            accept="application/pdf,.pdf"
            multiple
            files={files}
            onChange={handleDropzoneChange}
            label="Drop your PDF Files here"
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
                <button
                  type="button"
                  onClick={() => setMode("split")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                    mode === "split"
                      ? "bg-teal-300 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Split
                </button>
                <button
                  type="button"
                  onClick={() => setMode("extract")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                    mode === "extract"
                      ? "bg-teal-300 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <SquareStack className="h-3.5 w-3.5" />
                  Extract
                </button>
              </div>

              {mode === "split" && (
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={useEveryN}
                    onChange={(event) => setUseEveryN(event.target.checked)}
                    className="accent-teal-300"
                  />
                  Split after every
                  <input
                    type="number"
                    min={1}
                    value={everyN}
                    onChange={(event) => setEveryN(Math.max(1, Number(event.target.value) || 1))}
                    className="w-12 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-center text-zinc-100 outline-none"
                  />
                  pages
                </label>
              )}

              {mode === "extract" && (
                <>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={selectedCount === pages.length && pages.length > 0}
                      onChange={(event) =>
                        setPages((current) =>
                          current.map((page) => ({
                            ...page,
                            selected: event.target.checked,
                          })),
                        )
                      }
                      className="accent-teal-300"
                    />
                    Select all
                  </label>
                  <button
                    type="button"
                    onClick={() => setSeparateFiles((value) => !value)}
                    className={`rounded-full px-3 py-1.5 text-xs transition ${
                      separateFiles
                        ? "bg-teal-400/20 text-teal-200 ring-1 ring-teal-300/40"
                        : "border border-white/10 text-zinc-300"
                    }`}
                  >
                    Separate PDFs
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={rotateSelectedOrAll}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/25"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Rotate
              </button>

              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:border-teal-300/40 hover:text-teal-200"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                Add file
              </button>

              <input
                ref={addInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(event) => handleAddFiles(event.target.files)}
              />

              <label className="ml-auto flex min-w-[180px] items-center gap-2 text-xs text-zinc-400">
                {mode === "split" ? "Prefix" : "Name"}
                <input
                  type="text"
                  value={outputName}
                  onChange={(event) => setOutputName(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-teal-300/40"
                />
              </label>

              <button
                type="button"
                disabled={busy || loading || pages.length === 0}
                onClick={runAction}
                className="rounded-full bg-rose-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy
                  ? "Working…"
                  : mode === "split"
                    ? "Split PDF"
                    : "Extract PDF"}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
              <p className="inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                {mode === "split"
                  ? "Click between pages to split. Name each group below."
                  : "Choose pages to extract."}
              </p>
              <p>{statusText}</p>
            </div>
          </>
        )}

        {mode === "split" && files.length > 0 && namedGroups.length > 0 && !loading && (
          <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                Splits
              </p>
              <p className="text-xs text-zinc-500">
                Extract one group, or use Split PDF for all
              </p>
            </div>
            <div className="space-y-2">
              {namedGroups.map((group) => {
                const color =
                  SPLIT_COLORS[group.groupIndex % SPLIT_COLORS.length];
                const pageLabel =
                  group.start === group.end
                    ? `Page ${group.start + 1}`
                    : `Pages ${group.start + 1}–${group.end + 1}`;
                return (
                  <div
                    key={`${group.start}-${group.end}`}
                    className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
                    style={{
                      borderColor: color.border,
                      background: color.bg,
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color.accent }}
                    />
                    <p className="w-24 shrink-0 text-xs text-zinc-300">{pageLabel}</p>
                    <input
                      type="text"
                      value={groupNames[group.start] ?? ""}
                      placeholder={`${outputName.trim() || "split"}-part-${group.groupIndex + 1}`}
                      onChange={(event) =>
                        setGroupNames((current) => ({
                          ...current,
                          [group.start]: event.target.value,
                        }))
                      }
                      className="min-w-[160px] flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-teal-300/40"
                    />
                    <button
                      type="button"
                      disabled={busy || loading}
                      onClick={() => void extractGroup(group.groupIndex)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-white/30 hover:text-white disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Extract this split
                    </button>
                  </div>
                );
              })}
            </div>
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
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-zinc-400">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Rendering pages {progress.done}
              {progress.total ? `/${progress.total}` : ""}…
            </div>
          ) : (
            <div className="flex flex-wrap items-stretch gap-y-4">
              {pages.map((page, index) => {
                const groupIndex = groupIndexForPage(groups, index);
                const color =
                  mode === "split"
                    ? SPLIT_COLORS[Math.max(0, groupIndex) % SPLIT_COLORS.length]
                    : SPLIT_COLORS[0];
                const isSplit = splitAfter.has(index) && index < pages.length - 1;
                const nextGroupIndex = groupIndexForPage(groups, index + 1);
                const splitColor =
                  SPLIT_COLORS[Math.max(0, nextGroupIndex) % SPLIT_COLORS.length];

                return (
                  <div key={page.id} className="flex items-stretch">
                    <article
                      className="group relative w-[148px] cursor-zoom-in overflow-hidden rounded-2xl border transition"
                      style={{
                        background:
                          mode === "split" ? color.bg : "rgba(255,255,255,0.03)",
                        borderColor:
                          mode === "extract" && page.selected
                            ? "rgba(45,212,191,0.55)"
                            : mode === "split"
                              ? color.border
                              : "rgba(255,255,255,0.1)",
                      }}
                      onClick={() => setPeekId(page.id)}
                    >
                      <div className="relative aspect-[3/4] bg-zinc-950/40 p-2">
                        {mode === "extract" && (
                          <label
                            className="absolute left-2 top-2 z-10"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={page.selected}
                              onChange={() =>
                                setPages((current) =>
                                  current.map((item) =>
                                    item.id === page.id
                                      ? { ...item, selected: !item.selected }
                                      : item,
                                  ),
                                )
                              }
                              className="h-4 w-4 accent-teal-300"
                            />
                          </label>
                        )}

                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={page.previewUrl}
                          alt={`Page ${index + 1}`}
                          className="h-full w-full object-contain"
                          style={{ transform: `rotate(${page.rotation}deg)` }}
                          draggable={false}
                        />

                        <div className="absolute inset-x-2 top-2 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              rotateOne(page.id);
                            }}
                            className="rounded-md bg-black/70 p-1.5 text-zinc-100 hover:bg-black/90"
                            aria-label="Rotate page"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteOne(page.id);
                            }}
                            className="rounded-md bg-black/70 p-1.5 text-rose-200 hover:bg-rose-500/80"
                            aria-label="Delete page"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 border-t border-white/5 px-2 py-2 text-center">
                        <p className="truncate text-[11px] text-zinc-400" title={page.fileName}>
                          {page.fileName}
                        </p>
                        <p className="text-xs font-medium text-zinc-200">{index + 1}</p>
                      </div>
                    </article>

                    {index < pages.length - 1 && mode === "split" && (
                      <button
                        type="button"
                        onClick={() => {
                          setUseEveryN(false);
                          setSplitAfter((current) => toggleSplitAfter(current, index));
                        }}
                        className="group/split relative mx-1 flex w-8 flex-col items-center justify-center"
                        aria-label={
                          isSplit
                            ? `Remove split after page ${index + 1}`
                            : `Split after page ${index + 1}`
                        }
                        title="Click to split here"
                      >
                        <span
                          className="absolute inset-y-3 w-px border-l border-dashed"
                          style={{
                            borderColor: isSplit
                              ? splitColor.accent
                              : "rgba(255,255,255,0.18)",
                            borderWidth: isSplit ? 2 : 1,
                          }}
                        />
                        <span
                          className={`relative z-10 rounded-full p-1.5 transition ${
                            isSplit
                              ? "text-zinc-950"
                              : "bg-zinc-900 text-zinc-500 group-hover/split:text-zinc-200"
                          }`}
                          style={{
                            backgroundColor: isSplit ? splitColor.accent : undefined,
                          }}
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    )}

                    {index < pages.length - 1 && mode === "extract" && (
                      <div className="mx-1 w-4 border-l border-dashed border-white/10" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <PagePeekModal
        open={Boolean(peekPage)}
        placeholderUrl={peekPage?.previewUrl ?? null}
        sourceBytes={peekPage ? sources.get(peekPage.fileId) ?? null : null}
        sourceIndex={peekPage?.sourceIndex ?? 0}
        label={
          peekPage
            ? `Page ${peekIndex + 1} of ${pages.length} · ${peekPage.fileName}`
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
