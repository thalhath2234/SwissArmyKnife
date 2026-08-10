import { loadPdfDocument } from "@/lib/pdf/pdfjs";

export type PageThumb = {
  sourceIndex: number;
  url: string;
  width: number;
  height: number;
};

/** Target CSS width for sharp previews across the app. */
export const PREVIEW_TARGET_WIDTH = 1200;

function deviceScale(targetCssWidth: number, pageWidthAt1x: number): number {
  const dpr = Math.min(
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2,
    2.5,
  );
  return (targetCssWidth / pageWidthAt1x) * dpr;
}

async function renderPageToObjectUrl(
  // pdf.js page proxy — keep loosely typed to avoid version-coupled RenderParameters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  scale: number,
  mimeType: "image/png" | "image/jpeg" = "image/jpeg",
  quality = 0.95,
): Promise<{ url: string; width: number; height: number }> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create preview canvas.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  await page.render({
    canvasContext: context,
    viewport,
    canvas,
    intent: "display",
  }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Failed to encode preview."))),
      mimeType,
      quality,
    );
  });

  return {
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function createPageThumbnails(
  source: Uint8Array,
  scaleOrTarget?: number | ((done: number, total: number) => void),
  onProgress?: (done: number, total: number) => void,
): Promise<PageThumb[]> {
  if (typeof window === "undefined") {
    throw new Error("Page previews only run in the UI.");
  }

  let progress = onProgress;
  let targetWidth = PREVIEW_TARGET_WIDTH;
  if (typeof scaleOrTarget === "function") {
    progress = scaleOrTarget;
  } else if (typeof scaleOrTarget === "number") {
    if (scaleOrTarget < 5) {
      targetWidth = 0;
    } else {
      targetWidth = scaleOrTarget;
    }
  }

  const legacyScale = typeof scaleOrTarget === "number" && scaleOrTarget < 5 ? scaleOrTarget : null;

  const pdf = await loadPdfDocument(source);
  const thumbs: PageThumb[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale =
      legacyScale ??
      deviceScale(targetWidth || PREVIEW_TARGET_WIDTH, base.width);
    const rendered = await renderPageToObjectUrl(page, scale, "image/jpeg", 0.95);
    thumbs.push({
      sourceIndex: pageNumber - 1,
      url: rendered.url,
      width: rendered.width,
      height: rendered.height,
    });
    progress?.(pageNumber, pdf.numPages);
  }

  return thumbs;
}

/** High-resolution single-page render for peek/lightbox viewing. */
export async function createHighResPagePreview(
  source: Uint8Array,
  sourceIndex: number,
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Page previews only run in the UI.");
  }

  const pdf = await loadPdfDocument(source);
  const page = await pdf.getPage(sourceIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const targetCssWidth = Math.min(1600, Math.floor(window.innerWidth * 0.94));
  const scale = deviceScale(targetCssWidth, base.width);

  const rendered = await renderPageToObjectUrl(page, scale, "image/png");
  return rendered.url;
}

/** Re-render one page preview after an in-place content edit. */
export async function createSinglePageThumbnail(
  source: Uint8Array,
  sourceIndex: number,
  targetCssWidth = PREVIEW_TARGET_WIDTH,
): Promise<PageThumb> {
  const pdf = await loadPdfDocument(source);
  const page = await pdf.getPage(sourceIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = deviceScale(targetCssWidth, base.width);
  const rendered = await renderPageToObjectUrl(page, scale, "image/jpeg", 0.95);
  return {
    sourceIndex,
    url: rendered.url,
    width: rendered.width,
    height: rendered.height,
  };
}

export async function createPdfFirstPagePreview(
  source: Uint8Array,
  targetCssWidth = PREVIEW_TARGET_WIDTH,
): Promise<{ url: string; pageCount: number }> {
  const pdf = await loadPdfDocument(source);
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = deviceScale(targetCssWidth, base.width);
  const rendered = await renderPageToObjectUrl(page, scale, "image/jpeg", 0.95);
  return { url: rendered.url, pageCount: pdf.numPages };
}

export function revokePageThumbnails(thumbs: { url: string }[]) {
  thumbs.forEach((thumb) => URL.revokeObjectURL(thumb.url));
}
