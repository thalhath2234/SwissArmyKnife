"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import type { UploadedFile } from "@/lib/files/uploaded";
import { downloadBytes } from "@/lib/pdf/download";
import { fillFormFields, listFormFields, type FillableField } from "@/lib/pdf/fill";
import { createFilePreview, sanitizeOutputName } from "@/lib/pdf/preview";
import type { ToolDefinition } from "@/lib/tools/catalog";

export function FillWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [fields, setFields] = useState<FillableField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputName, setOutputName] = useState("filled.pdf");

  const file = files[0]?.file;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      if (!file) {
        setFields([]);
        setValues({});
        setPreviewUrl(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const listed = await listFormFields(bytes);
        const preview = await createFilePreview(file);
        if (cancelled) {
          URL.revokeObjectURL(preview.url);
          return;
        }
        objectUrl = preview.url;
        setPreviewUrl(preview.url);
        setFields(listed);
        setValues(
          Object.fromEntries(listed.map((field) => [field.name, field.value])),
        );
        setOutputName(
          sanitizeOutputName(`${file.name.replace(/\.pdf$/i, "")}-filled`),
        );
        if (listed.length === 0) {
          setError(
            "No interactive AcroForm fields found. This tool fills existing form fields only.",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to read form fields.");
          setFields([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  async function handleSave() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      const bytes = await fillFormFields(source, values);
      downloadBytes(bytes, sanitizeOutputName(outputName), "application/pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fill PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="space-y-5 rounded-3xl border border-white/8 bg-white/[0.03] p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Phase {tool.phase} · {tool.mode}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-zinc-50">
            {tool.name}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
            Detect interactive PDF form fields, fill them in, and download a flattened PDF.
          </p>
        </div>

        <FileDropzone
          accept="application/pdf,.pdf"
          multiple={false}
          files={files}
          onChange={setFiles}
          label="Drop a fillable PDF here"
        />

        {file && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[200px] flex-1 space-y-1 text-sm text-zinc-400">
              Output name
              <input
                type="text"
                value={outputName.replace(/\.pdf$/i, "")}
                onChange={(event) =>
                  setOutputName(sanitizeOutputName(event.target.value, "filled"))
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:border-teal-300/40"
              />
            </label>
            <button
              type="button"
              disabled={busy || loading || fields.length === 0}
              onClick={handleSave}
              className="rounded-full bg-teal-300 px-5 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Download filled PDF"}
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Reading form fields…
          </div>
        ) : (
          fields.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-200">
                Fields ({fields.length})
              </h2>
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {fields.map((field) => (
                  <label
                    key={field.name}
                    className="block space-y-1 rounded-xl border border-white/8 bg-black/20 p-3 text-sm"
                  >
                    <span className="text-xs uppercase tracking-wide text-zinc-500">
                      {field.type} · {field.name}
                    </span>
                    {field.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={values[field.name] === "true"}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.checked ? "true" : "false",
                          }))
                        }
                        className="mt-2 accent-teal-300"
                      />
                    ) : field.type === "dropdown" && field.options ? (
                      <select
                        value={values[field.name] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none"
                      >
                        <option value="">Select…</option>
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={values[field.name] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:border-teal-300/40"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )
        )}
      </section>

      <section className="rounded-3xl border border-white/8 bg-black/25 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-zinc-100">
          Preview
        </h2>
        {!previewUrl ? (
          <p className="mt-3 text-sm text-zinc-500">Upload a fillable PDF to preview.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Form preview" className="w-full object-contain" />
          </div>
        )}
      </section>
    </div>
  );
}
