"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, X } from "lucide-react";
import { createHighResPagePreview } from "@/lib/pdf/pageThumbs";

interface PagePeekModalProps {
  open: boolean;
  /** Low-res placeholder while high-res loads */
  placeholderUrl?: string | null;
  sourceBytes?: Uint8Array | null;
  sourceIndex?: number;
  label?: string;
  rotation?: number;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

export function PagePeekModal({
  open,
  placeholderUrl = null,
  sourceBytes = null,
  sourceIndex = 0,
  label,
  rotation = 0,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
  onClose,
}: PagePeekModalProps) {
  const [hiResUrl, setHiResUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (hasPrev) onPrev?.();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (hasNext) onNext?.();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    if (!open || !sourceBytes) {
      setHiResUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setHiResUrl(null);

    createHighResPagePreview(sourceBytes, sourceIndex)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setHiResUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render page.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, sourceBytes, sourceIndex]);

  if (!open) return null;

  const displayUrl = hiResUrl ?? placeholderUrl;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label ?? "Page preview"}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-10 rounded-full border border-white/15 bg-black/50 p-2 text-zinc-200 transition hover:bg-white/10"
        aria-label="Close preview"
      >
        <X className="h-4 w-4" />
      </button>

      {hasPrev && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPrev?.();
          }}
          className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-zinc-100 transition hover:bg-white/15 sm:left-6"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNext?.();
          }}
          className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-zinc-100 transition hover:bg-white/15 sm:right-6"
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div
        className="relative flex max-h-[92vh] max-w-[min(1400px,96vw)] flex-col items-center"
        onClick={onClose}
      >
        <div className="relative overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-white/10">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt={label ?? "Page preview"}
              className={`max-h-[86vh] w-auto object-contain ${
                hiResUrl ? "" : "opacity-80"
              }`}
              style={{ transform: `rotate(${rotation}deg)` }}
              draggable={false}
            />
          ) : (
            <div className="flex h-[60vh] w-[min(480px,80vw)] items-center justify-center bg-zinc-100">
              <LoaderCircle className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          )}

          {loading && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-zinc-100">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Rendering clear preview…
            </div>
          )}
        </div>

        {label && (
          <p className="mt-3 text-center text-sm text-zinc-300">{label}</p>
        )}
        {error && (
          <p className="mt-2 text-center text-sm text-rose-300">{error}</p>
        )}
      </div>
    </div>
  );
}
