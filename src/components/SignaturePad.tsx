"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type, Upload } from "lucide-react";
import { canvasToPngBytes, fileToPngBytes, renderTypedSignature } from "@/lib/pdf/sign";

type PadMode = "draw" | "type" | "upload";

interface SignaturePadProps {
  onCreate: (png: Uint8Array, previewUrl: string) => void;
  onCancel: () => void;
}

export function SignaturePad({ onCreate, onCancel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<PadMode>("draw");
  const [typed, setTyped] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadBytes, setUploadBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
  }, [mode]);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    const bytes = await fileToPngBytes(file);
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }));
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadBytes(bytes);
    setUploadPreview(url);
  }

  function handleCreate() {
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bytes = canvasToPngBytes(canvas);
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }));
      onCreate(bytes, url);
      return;
    }
    if (mode === "type") {
      const bytes = renderTypedSignature(typed);
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }));
      onCreate(bytes, url);
      return;
    }
    if (mode === "upload" && uploadBytes && uploadPreview) {
      onCreate(uploadBytes, uploadPreview);
    }
  }

  const canCreate =
    mode === "draw" ||
    (mode === "type" && typed.trim().length > 0) ||
    (mode === "upload" && Boolean(uploadBytes));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#12161d] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-[family-name:var(--font-display)] text-xl text-zinc-50">
          Create signature
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Draw, type, or upload — then place it on the page.
        </p>

        <div className="mt-4 flex gap-2">
          {(
            [
              ["draw", PenLine, "Draw"],
              ["type", Type, "Type"],
              ["upload", Upload, "Upload"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                mode === id
                  ? "bg-teal-300 text-zinc-950"
                  : "border border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {mode === "draw" && (
            <div className="space-y-2">
              <canvas
                ref={canvasRef}
                width={640}
                height={220}
                className="w-full touch-none rounded-2xl border border-white/10 bg-white"
                onPointerDown={(event) => {
                  drawing.current = true;
                  const ctx = canvasRef.current?.getContext("2d");
                  if (!ctx) return;
                  const point = getPoint(event);
                  ctx.beginPath();
                  ctx.moveTo(point.x, point.y);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!drawing.current) return;
                  const ctx = canvasRef.current?.getContext("2d");
                  if (!ctx) return;
                  const point = getPoint(event);
                  ctx.lineTo(point.x, point.y);
                  ctx.stroke();
                }}
                onPointerUp={() => {
                  drawing.current = false;
                }}
              />
              <button
                type="button"
                onClick={clearCanvas}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                <Eraser className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          )}

          {mode === "type" && (
            <input
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type your name"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-lg italic text-zinc-100 outline-none focus:border-teal-300/40"
            />
          )}

          {mode === "upload" && (
            <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 text-sm text-zinc-400 hover:border-teal-300/40">
              {uploadPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploadPreview} alt="Signature upload" className="max-h-36 object-contain" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-teal-300" />
                  Upload PNG or JPG
                </>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:border-white/25"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={handleCreate}
            className="rounded-full bg-teal-300 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
          >
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
}
