"use client";

import { useEffect, useState } from "react";
import { FileText, LoaderCircle, ScanText } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import type { UploadedFile } from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import {
  buildSearchablePdf,
  ocrPdfDocument,
  pagesToPlainText,
  terminateOcrWorker,
  type OcrPageResult,
} from "@/lib/pdf/ocr";
import { createFilePreview, sanitizeOutputName } from "@/lib/pdf/preview";
import type { ToolDefinition } from "@/lib/tools/catalog";

const LANG_OPTIONS = [
  { id: "eng", label: "English" },
  { id: "jpn", label: "Japanese" },
  { id: "eng+jpn", label: "English + Japanese" },
];

export function OcrWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [langs, setLangs] = useState("eng+jpn");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OcrPageResult[] | null>(null);
  const [outputName, setOutputName] = useState("ocr");

  const file = files[0]?.file;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!file) {
      setPreviewUrl(null);
      setResults(null);
      return;
    }

    createFilePreview(file)
      .then((preview) => {
        if (!active) {
          URL.revokeObjectURL(preview.url);
          return;
        }
        objectUrl = preview.url;
        setPreviewUrl(preview.url);
        setOutputName(file.name.replace(/\.pdf$/i, "") || "ocr");
        setResults(null);
      })
      .catch(() => {
        if (active) setPreviewUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    return () => {
      void terminateOcrWorker();
    };
  }, []);

  async function runOcr() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResults(null);
    setStatus("Starting local OCR…");
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      const pages = await ocrPdfDocument(source, {
        langs,
        scale: 2,
        onProgress: ({ page, total, status: next }) => {
          setStatus(`${next} (${page}/${total})`);
        },
      });
      setResults(pages);
      setStatus(`Done · ${pages.length} page${pages.length === 1 ? "" : "s"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSearchable() {
    if (!results?.length) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildSearchablePdf(results);
      downloadBytes(
        bytes,
        sanitizeOutputName(`${outputName}-searchable`),
        "application/pdf",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build searchable PDF.");
    } finally {
      setBusy(false);
    }
  }

  function downloadText() {
    if (!results?.length) return;
    const text = pagesToPlainText(results);
    const bytes = new TextEncoder().encode(text);
    downloadBytes(bytes, `${outputName}.txt`, "text/plain");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-5 rounded-3xl border border-white/8 bg-white/[0.03] p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Phase {tool.phase} · local
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-zinc-50">
            {tool.name}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            Run OCR entirely on your machine with Tesseract. Export a searchable PDF
            (invisible text layer) or plain text. No cloud.
          </p>
        </div>

        <FileDropzone
          accept="application/pdf,.pdf"
          multiple={false}
          files={files}
          onChange={setFiles}
          label="Drop a scanned PDF here"
        />

        <label className="block space-y-1.5 text-sm text-zinc-400">
          Languages
          <select
            value={langs}
            onChange={(event) => setLangs(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none"
          >
            {LANG_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5 text-sm text-zinc-400">
          Output base name
          <input
            type="text"
            value={outputName}
            onChange={(event) => setOutputName(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none focus:border-teal-300/40"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!file || busy}
            onClick={runOcr}
            className="inline-flex items-center gap-2 rounded-full bg-teal-300 px-5 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-40"
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ScanText className="h-4 w-4" />
            )}
            {busy ? "Working…" : "Run OCR"}
          </button>

          <button
            type="button"
            disabled={!results?.length || busy}
            onClick={downloadSearchable}
            className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-zinc-200 disabled:opacity-40"
          >
            Download searchable PDF
          </button>
          <button
            type="button"
            disabled={!results?.length || busy}
            onClick={downloadText}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2.5 text-sm text-zinc-200 disabled:opacity-40"
          >
            <FileText className="h-4 w-4" />
            Download TXT
          </button>
        </div>

        {status && <p className="text-sm text-teal-200/90">{status}</p>}
        {error && (
          <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {results && (
          <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-white/8 bg-black/25 p-4">
            {results.map((page) => (
              <div key={page.pageIndex} className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Page {page.pageIndex + 1} · {page.words.length} words
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-300">
                  {page.text.trim() || "(no text detected)"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/8 bg-black/25 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-zinc-100">
          Preview
        </h2>
        {!previewUrl ? (
          <p className="mt-3 text-sm text-zinc-500">Upload a PDF to preview.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="OCR source preview" className="w-full object-contain" />
          </div>
        )}
      </section>
    </div>
  );
}
