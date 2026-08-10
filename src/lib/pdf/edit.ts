import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getPdfjs, loadPdfDocument } from "@/lib/pdf/pdfjs";
import { replaceTextInPdf } from "@/lib/pdf/textReplace";

export type EditObject =
  | {
      id: string;
      type: "text-edit";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      /** Text currently in the PDF content stream */
      originalText: string;
      text: string;
      fontSize: number;
      color: string;
      fontName?: string;
      sourceSpanId: string;
    }
  | {
      id: string;
      type: "text";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: number;
      color: string;
    }
  | {
      id: string;
      type: "image";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      png: Uint8Array;
      previewUrl: string;
    }
  | {
      id: string;
      type: "cover";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    };

export type ExtractedTextSpan = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  color: string;
  fontName: string;
};

function parseHex(color: string) {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const value = Number.parseInt(full, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function sampleColorFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(width - 1, Math.ceil(x1));
  const bottom = Math.min(height - 1, Math.ceil(y1));
  let bestDark = Number.POSITIVE_INFINITY;
  let color = "#111827";

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      if (a < 200) continue;
      // Skip near-white page background.
      if (r > 245 && g > 245 && b > 245) continue;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance < bestDark) {
        bestDark = luminance;
        color = rgbToHex(r, g, b);
      }
    }
  }

  return color;
}

export async function extractSelectableText(
  source: Uint8Array,
): Promise<ExtractedTextSpan[]> {
  const pdfjs = await getPdfjs();
  const pdf = await loadPdfDocument(source);
  const spans: ExtractedTextSpan[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    // Match pdf.js TextLayer: viewport transform → CSS top-left percentages.
    const viewport = page.getViewport({ scale: 1 });
    const sampleScale = 2;
    const sampleViewport = page.getViewport({ scale: sampleScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(sampleViewport.width);
    canvas.height = Math.ceil(sampleViewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not sample page colors.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx,
      viewport: sampleViewport,
      canvas,
    }).promise;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const content = await page.getTextContent();
    const styles = content.styles;

    for (const item of content.items) {
      if (!("str" in item) || !item.str?.trim()) continue;

      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const angle = Math.atan2(tx[1], tx[0]);
      const fontHeight = Math.hypot(tx[2], tx[3]) || 10;
      const style = styles[item.fontName];
      const ascentRatio =
        style && typeof style.ascent === "number" && style.ascent > 0 && style.ascent <= 1.2
          ? style.ascent
          : 0.8;
      const fontAscent = fontHeight * ascentRatio;

      let left: number;
      let top: number;
      if (Math.abs(angle) < 0.05) {
        left = tx[4];
        top = tx[5] - fontAscent;
      } else {
        left = tx[4] + fontAscent * Math.sin(angle);
        top = tx[5] - fontAscent * Math.cos(angle);
      }

      const rawWidth = style?.vertical ? item.height : item.width;
      // item.width is PDF user-space; map through viewport X scale (TextLayer-compatible).
      const xScale = Math.hypot(viewport.transform[0], viewport.transform[1]) || 1;
      const widthPx = Math.max(
        (rawWidth || fontHeight * Math.max(1, item.str.length) * 0.45) * xScale,
        fontHeight * 0.35,
      );
      const heightPx = Math.max(fontHeight, 4);

      // Skip microscopic / garbage runs (often false hits on images).
      if (widthPx < 2 || heightPx < 2) continue;
      if (left > viewport.width || top > viewport.height) continue;
      if (left + widthPx < 0 || top + heightPx < 0) continue;

      const x = left / viewport.width;
      const y = top / viewport.height;
      const width = widthPx / viewport.width;
      const height = heightPx / viewport.height;

      const color = sampleColorFromImageData(
        image.data,
        canvas.width,
        canvas.height,
        left * sampleScale,
        top * sampleScale,
        (left + widthPx) * sampleScale,
        (top + heightPx) * sampleScale,
      );

      spans.push({
        id: crypto.randomUUID(),
        pageIndex: pageNumber - 1,
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.min(width, 1 - Math.max(0, x)),
        height: Math.min(height, 1 - Math.max(0, y)),
        text: item.str,
        fontSize: fontHeight,
        color,
        fontName: item.fontName || "sans-serif",
      });
    }
  }

  return spans;
}

export async function applyEditsToPdf(
  source: Uint8Array,
  objects: EditObject[],
): Promise<Uint8Array> {
  const textEdits = objects.filter(
    (object): object is Extract<EditObject, { type: "text-edit" }> =>
      object.type === "text-edit" && object.originalText !== object.text,
  );

  let bytes = source;
  if (textEdits.length) {
    const result = await replaceTextInPdf(
      bytes,
      textEdits.map((edit) => ({
        pageIndex: edit.pageIndex,
        find: edit.originalText,
        replace: edit.text,
      })),
    );
    bytes = result.bytes;

    if (result.failed.length) {
      // Fallback: blank the original string in-stream, then draw replacement
      // at the same place (still no white cover rectangle).
      const blank = await replaceTextInPdf(
        bytes,
        result.failed.map((edit) => ({
          pageIndex: edit.pageIndex,
          find: edit.find,
          replace: " ".repeat(Math.max(1, edit.find.length)),
        })),
      );
      bytes = blank.bytes;

      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (const failed of result.failed) {
        const object = textEdits.find(
          (edit) =>
            edit.pageIndex === failed.pageIndex &&
            edit.originalText === failed.find,
        );
        if (!object) continue;
        const page = pdf.getPage(object.pageIndex);
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const x = pageWidth * object.x;
        const h = pageHeight * object.height;
        const y = pageHeight - pageHeight * object.y - h;
        const { r, g, b } = parseHex(object.color);
        page.drawText(object.text || " ", {
          x,
          y: y + Math.max(1, (h - object.fontSize) / 2),
          size: object.fontSize,
          font,
          color: rgb(r, g, b),
          maxWidth: Math.max(8, pageWidth * object.width),
        });
      }
      bytes = await pdf.save();
    }
  }

  const overlays = objects.filter(
    (object) =>
      object.type === "text" ||
      object.type === "image" ||
      object.type === "cover",
  );
  if (!overlays.length) return bytes;

  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const object of overlays) {
    const page = pdf.getPage(object.pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const x = pageWidth * object.x;
    const w = pageWidth * object.width;
    const h = pageHeight * object.height;
    const y = pageHeight - pageHeight * object.y - h;

    if (object.type === "cover") {
      const { r, g, b } = parseHex(object.color);
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(r, g, b),
        borderWidth: 0,
      });
      continue;
    }

    if (object.type === "text") {
      const { r, g, b } = parseHex(object.color);
      page.drawText(object.text || " ", {
        x: x + 1,
        y: y + Math.max(1, (h - object.fontSize) / 2),
        size: object.fontSize,
        font,
        color: rgb(r, g, b),
        maxWidth: Math.max(8, w - 2),
        lineHeight: object.fontSize * 1.15,
      });
    }

    if (object.type === "image") {
      const image = await pdf.embedPng(object.png);
      page.drawImage(image, { x, y, width: w, height: h });
    }
  }

  return pdf.save();
}

/**
 * Apply a single in-place text edit to working PDF bytes and return new bytes.
 */
export async function commitTextEdit(
  source: Uint8Array,
  edit: {
    pageIndex: number;
    find: string;
    replace: string;
  },
): Promise<{ bytes: Uint8Array; ok: boolean }> {
  if (edit.find === edit.replace) {
    return { bytes: source, ok: true };
  }
  const result = await replaceTextInPdf(source, [edit]);
  return {
    bytes: result.bytes,
    ok: result.failed.length === 0,
  };
}

export async function fileToPngBytes(file: File): Promise<Uint8Array> {
  if (file.type === "image/png") {
    return new Uint8Array(await file.arrayBuffer());
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not convert image.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("PNG encode failed."))),
      "image/png",
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}
