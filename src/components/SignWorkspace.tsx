"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, PenLine } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { SignaturePad } from "@/components/SignaturePad";
import type { UploadedFile } from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import {
  createPageThumbnails,
  revokePageThumbnails,
} from "@/lib/pdf/pageThumbs";
import { sanitizeOutputName } from "@/lib/pdf/preview";
import { applySignatureToPdf, type SignaturePlacement } from "@/lib/pdf/sign";
import type { ToolDefinition } from "@/lib/tools/catalog";

type PageItem = {
  sourceIndex: number;
  previewUrl: string;
};

export function SignWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);
  const [signaturePng, setSignaturePng] = useState<Uint8Array | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [placement, setPlacement] = useState<SignaturePlacement>({
    pageIndex: 0,
    x: 0.55,
    y: 0.72,
    width: 0.28,
    height: 0.1,
  });
  const [outputName, setOutputName] = useState("signed.pdf");
  const stageRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: SignaturePlacement;
  } | null>(null);

  const current = pages[pageIndex] ?? null;

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
        setPages((currentPages) => {
          revokePageThumbnails(currentPages.map((page) => ({ url: page.previewUrl })));
          return thumbs.map((thumb) => ({
            sourceIndex: thumb.sourceIndex,
            previewUrl: thumb.url,
          }));
        });
        setPageIndex(0);
        setPlacement((prev) => ({ ...prev, pageIndex: 0 }));
        setOutputName(
          sanitizeOutputName(`${uploaded.file.name.replace(/\.pdf$/i, "")}-signed`),
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
      if (signatureUrl) URL.revokeObjectURL(signatureUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPlacement((prev) => ({ ...prev, pageIndex }));
  }, [pageIndex]);

  const stageStyle = useMemo(
    () => ({
      left: `${placement.x * 100}%`,
      top: `${placement.y * 100}%`,
      width: `${placement.width * 100}%`,
      height: `${placement.height * 100}%`,
    }),
    [placement],
  );

  function onPointerMove(event: React.PointerEvent) {
    if (!dragState.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = (event.clientX - dragState.current.startX) / rect.width;
    const dy = (event.clientY - dragState.current.startY) / rect.height;
    const origin = dragState.current.origin;

    if (dragState.current.mode === "move") {
      setPlacement({
        ...origin,
        x: Math.min(Math.max(origin.x + dx, 0), 1 - origin.width),
        y: Math.min(Math.max(origin.y + dy, 0), 1 - origin.height),
        pageIndex,
      });
      return;
    }

    setPlacement({
      ...origin,
      width: Math.min(Math.max(origin.width + dx, 0.08), 1 - origin.x),
      height: Math.min(Math.max(origin.height + dy, 0.04), 1 - origin.y),
      pageIndex,
    });
  }

  function endDrag() {
    dragState.current = null;
  }

  async function handleSave() {
    if (!sourceBytes || !signaturePng) {
      setError("Create a signature and place it before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bytes = await applySignatureToPdf(sourceBytes, signaturePng, {
        ...placement,
        pageIndex,
      });
      downloadBytes(bytes, sanitizeOutputName(outputName), "application/pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign PDF.");
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
            Create a signature, drag it onto the page, resize, then download the signed PDF.
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
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => setShowPad(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:border-teal-300/40 hover:text-teal-200"
            >
              <PenLine className="h-4 w-4" />
              {signatureUrl ? "Change signature" : "Create signature"}
            </button>

            <label className="block min-w-[200px] flex-1 space-y-1 text-sm text-zinc-400">
              Output name
              <input
                type="text"
                value={outputName.replace(/\.pdf$/i, "")}
                onChange={(event) =>
                  setOutputName(sanitizeOutputName(event.target.value, "signed"))
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:border-teal-300/40"
              />
            </label>

            <button
              type="button"
              disabled={busy || !signaturePng || loading}
              onClick={handleSave}
              className="rounded-full bg-teal-300 px-5 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Download signed PDF"}
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
              Place signature
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
                Page {pageIndex + 1} / {pages.length || 1}
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
              className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-900"
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.previewUrl}
                alt={`Page ${pageIndex + 1}`}
                className="block w-full select-none"
                draggable={false}
              />

              {signatureUrl && (
                <div
                  className="absolute cursor-move touch-none rounded-md border border-teal-300/70 bg-teal-300/10 shadow-lg"
                  style={stageStyle}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    dragState.current = {
                      mode: "move",
                      startX: event.clientX,
                      startY: event.clientY,
                      origin: placement,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signatureUrl}
                    alt="Signature"
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                  <button
                    type="button"
                    aria-label="Resize signature"
                    className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-se-resize rounded-full bg-teal-300"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      dragState.current = {
                        mode: "resize",
                        startX: event.clientX,
                        startY: event.clientY,
                        origin: placement,
                      };
                      (event.currentTarget.parentElement as HTMLElement).setPointerCapture(
                        event.pointerId,
                      );
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {showPad && (
        <SignaturePad
          onCancel={() => setShowPad(false)}
          onCreate={(png, previewUrl) => {
            if (signatureUrl) URL.revokeObjectURL(signatureUrl);
            setSignaturePng(png);
            setSignatureUrl(previewUrl);
            setShowPad(false);
          }}
        />
      )}
    </div>
  );
}
