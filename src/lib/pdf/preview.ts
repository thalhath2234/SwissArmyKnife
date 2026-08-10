import { createPdfFirstPagePreview } from "@/lib/pdf/pageThumbs";

export async function createFilePreview(
  file: File,
): Promise<{ url: string; pageCount?: number }> {
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
    return { url: URL.createObjectURL(file) };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  return createPdfFirstPagePreview(data);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeOutputName(name: string, fallback = "merged"): string {
  const trimmed = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
  const withoutExt = trimmed.replace(/\.pdf$/i, "");
  return `${withoutExt || fallback}.pdf`;
}
