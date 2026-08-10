"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import type { UploadedFile } from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import { createFilePreview, formatBytes, sanitizeOutputName } from "@/lib/pdf/preview";
import { protectPdf } from "@/lib/pdf/protect";
import type { ToolDefinition } from "@/lib/tools/catalog";

export function ProtectWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | undefined>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [outputName, setOutputName] = useState("protected.pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const file = files[0]?.file;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!file) {
      setPreviewUrl(null);
      setPageCount(undefined);
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
        setPageCount(preview.pageCount);
        setOutputName(
          sanitizeOutputName(`${file.name.replace(/\.pdf$/i, "")}-protected`),
        );
      })
      .catch(() => {
        if (active) setPreviewUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  async function handleProtect() {
    if (!file) return;
    if (password.trim() !== confirm.trim()) {
      setError("Password confirmation does not match.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      const bytes = await protectPdf(source, password, ownerPassword || undefined);
      downloadBytes(bytes, sanitizeOutputName(outputName), "application/pdf");
      setMessage("Protected PDF downloaded. Open password is required to view it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not protect PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-5 rounded-3xl border border-white/8 bg-white/[0.03] p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Phase {tool.phase} · {tool.mode}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-zinc-50">
            {tool.name}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            Add an open password so the PDF cannot be viewed without it. Optional owner
            password defaults to the same value.
          </p>
        </div>

        <FileDropzone
          accept="application/pdf,.pdf"
          multiple={false}
          files={files}
          onChange={setFiles}
          label="Drop your PDF File here"
        />

        <label className="block space-y-1.5 text-sm text-zinc-400">
          Open password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none focus:border-teal-300/40"
            placeholder="Required to open the PDF"
          />
        </label>

        <label className="block space-y-1.5 text-sm text-zinc-400">
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none focus:border-teal-300/40"
          />
        </label>

        <label className="block space-y-1.5 text-sm text-zinc-400">
          Owner password (optional)
          <input
            type="password"
            value={ownerPassword}
            onChange={(event) => setOwnerPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none focus:border-teal-300/40"
            placeholder="Defaults to open password"
          />
        </label>

        <label className="block space-y-1.5 text-sm text-zinc-400">
          Output file name
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={outputName.replace(/\.pdf$/i, "")}
              onChange={(event) =>
                setOutputName(sanitizeOutputName(event.target.value, "protected"))
              }
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-zinc-100 outline-none focus:border-teal-300/40"
            />
            <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-zinc-500">
              .pdf
            </span>
          </div>
        </label>

        <button
          type="button"
          disabled={busy || !file || !password.trim()}
          onClick={handleProtect}
          className="inline-flex items-center gap-2 rounded-full bg-teal-300 px-5 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-40"
        >
          <Lock className="h-4 w-4" />
          {busy ? "Protecting…" : "Protect & Download"}
        </button>

        {error && (
          <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl border border-teal-400/20 bg-teal-400/10 px-4 py-3 text-sm text-teal-100">
            {message}
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-white/8 bg-black/25 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-zinc-100">
          Preview
        </h2>
        {!file ? (
          <p className="mt-3 text-sm text-zinc-500">Upload a PDF to preview the first page.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="PDF preview" className="w-full object-contain" />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
                  No preview
                </div>
              )}
            </div>
            <p className="text-sm text-zinc-400">
              {file.name}
              {pageCount ? ` · ${pageCount} pages` : ""} · {formatBytes(file.size)}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
