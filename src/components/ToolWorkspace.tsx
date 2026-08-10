"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDropzone } from "@/components/FileDropzone";
import { runToolJob } from "@/lib/hybrid/router";
import type { UploadedFile } from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import { sanitizeOutputName } from "@/lib/pdf/preview";
import type { ToolDefinition } from "@/lib/tools/catalog";
import type { ProcessResult } from "@/lib/hybrid/types";

function defaultOutputName(slug: string, files: UploadedFile[]): string {
  if (slug === "merge-pdf") return "merged.pdf";
  if (slug === "images-to-pdf") return "images.pdf";
  if (files[0]) {
    const base = files[0].file.name.replace(/\.[^.]+$/, "");
    if (slug === "split-pdf") return `${base}-split.pdf`;
    if (slug === "compress-pdf") return `${base}-compressed.pdf`;
    if (slug === "unlock-pdf") return `${base}-unlocked.pdf`;
  }
  return "output.pdf";
}

export function ToolWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [password, setPassword] = useState("");
  const [compressLevel, setCompressLevel] = useState<"light" | "strong">("light");
  const [outputName, setOutputName] = useState("merged.pdf");
  const [nameTouched, setNameTouched] = useState(false);

  const accept = useMemo(() => {
    if (tool.slug === "images-to-pdf") return "image/png,image/jpeg,.png,.jpg,.jpeg";
    return "application/pdf,.pdf";
  }, [tool.slug]);

  const multiple = tool.slug === "merge-pdf" || tool.slug === "images-to-pdf";
  const supportsOutputName = [
    "merge-pdf",
    "images-to-pdf",
    "split-pdf",
    "compress-pdf",
    "unlock-pdf",
  ].includes(tool.slug);

  useEffect(() => {
    if (!nameTouched) {
      setOutputName(defaultOutputName(tool.slug, files));
    }
  }, [tool.slug, files, nameTouched]);

  async function handleRun() {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const output = await runToolJob({
        toolSlug: tool.slug,
        files: files.map((item) => item.file),
        options: {
          startPage,
          endPage,
          password,
          level: compressLevel,
          outputName: sanitizeOutputName(
            outputName,
            tool.slug === "images-to-pdf" ? "images" : "merged",
          ),
        },
      });
      setResults(output);

      const failures = output.filter(
        (item) => item.status === "error" || item.status === "needs_cloud",
      );
      if (failures.length && !output.some((item) => item.status === "done")) {
        setError(failures.map((item) => item.message).filter(Boolean).join(" "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function updateResultName(index: number, nextName: string) {
    setResults((current) =>
      current.map((item, i) =>
        i === index
          ? {
              ...item,
              filename: sanitizeOutputName(nextName, item.filename.replace(/\.pdf$/i, "")),
            }
          : item,
      ),
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-5 rounded-3xl border border-white/8 bg-white/[0.03] p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Phase {tool.phase} · {tool.mode}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-zinc-50">
            {tool.name}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            {tool.description}
          </p>
        </div>

        <FileDropzone
          accept={accept}
          multiple={multiple}
          files={files}
          onChange={(next) => {
            setFiles(next);
            if (!nameTouched) setOutputName(defaultOutputName(tool.slug, next));
          }}
          label={
            multiple
              ? "Drop your PDF Files here"
              : "Drop your PDF File here"
          }
        />

        {supportsOutputName && (
          <label className="block space-y-1.5 text-sm text-zinc-400">
            Output file name
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={outputName.replace(/\.pdf$/i, "")}
                onChange={(event) => {
                  setNameTouched(true);
                  setOutputName(sanitizeOutputName(event.target.value));
                }}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none focus:border-teal-300/40"
                placeholder={tool.slug === "merge-pdf" ? "merged" : "output"}
              />
              <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-zinc-500">
                .pdf
              </span>
            </div>
          </label>
        )}

        {tool.slug === "split-pdf" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm text-zinc-400">
              Start page
              <input
                type="number"
                min={1}
                value={startPage}
                onChange={(event) => setStartPage(Number(event.target.value))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:border-teal-300/40"
              />
            </label>
            <label className="space-y-1 text-sm text-zinc-400">
              End page
              <input
                type="number"
                min={1}
                value={endPage}
                onChange={(event) => setEndPage(Number(event.target.value))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:border-teal-300/40"
              />
            </label>
          </div>
        )}

        {tool.slug === "unlock-pdf" && (
          <label className="block space-y-1 text-sm text-zinc-400">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:border-teal-300/40"
              placeholder="Required if the PDF is encrypted"
            />
          </label>
        )}

        {tool.slug === "compress-pdf" && (
          <div className="flex gap-2">
            {(["light", "strong"] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setCompressLevel(level)}
                className={`rounded-full px-4 py-2 text-sm capitalize transition ${
                  compressLevel === level
                    ? "bg-teal-400/20 text-teal-200 ring-1 ring-teal-300/40"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={busy || files.length === 0 || (tool.slug === "merge-pdf" && files.length < 2)}
          onClick={handleRun}
          className="rounded-full bg-teal-300 px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy
            ? "Working…"
            : tool.slug === "merge-pdf"
              ? "Merge Selected Files"
              : "Run tool"}
        </button>

        {error && (
          <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-white/8 bg-black/25 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-zinc-100">
          Results
        </h2>
        {results.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Output files will appear here after you run the tool.
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((result, index) => (
              <li
                key={`${result.filename}-${index}`}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    {result.status === "done" && result.mimeType === "application/pdf" ? (
                      <label className="block space-y-1 text-xs text-zinc-500">
                        File name
                        <input
                          type="text"
                          value={result.filename.replace(/\.pdf$/i, "")}
                          onChange={(event) => updateResultName(index, event.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-teal-300/40"
                        />
                      </label>
                    ) : (
                      <p className="truncate text-sm text-zinc-200">{result.filename}</p>
                    )}
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {result.status}
                    </p>
                    {result.message && (
                      <p className="text-sm text-zinc-400">{result.message}</p>
                    )}
                  </div>
                  {result.status === "done" && result.data && (
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-200 hover:border-teal-300/40 hover:text-teal-200"
                      onClick={() =>
                        downloadBytes(result.data!, result.filename, result.mimeType)
                      }
                    >
                      Download
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
