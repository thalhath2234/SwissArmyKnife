import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createWorker, type Worker } from "tesseract.js";
import { loadPdfDocument } from "@/lib/pdf/pdfjs";

export type OcrProgress = {
  page: number;
  total: number;
  status: string;
};

export type OcrWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type OcrPageResult = {
  pageIndex: number;
  width: number;
  height: number;
  imagePng: Uint8Array;
  text: string;
  words: OcrWord[];
};

let sharedWorker: Worker | null = null;
let sharedLangs: string | null = null;

async function getOcrWorker(langs: string) {
  if (sharedWorker && sharedLangs === langs) return sharedWorker;
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
  sharedWorker = await createWorker(langs);
  sharedLangs = langs;
  return sharedWorker;
}

export async function terminateOcrWorker() {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
    sharedLangs = null;
  }
}

async function renderPdfPagePng(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  scale: number,
): Promise<{ png: Uint8Array; width: number; height: number }> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create canvas.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("PNG encode failed."))),
      "image/png",
    );
  });

  return {
    png: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function ocrPdfDocument(
  source: Uint8Array,
  options?: {
    langs?: string;
    scale?: number;
    onProgress?: (progress: OcrProgress) => void;
  },
): Promise<OcrPageResult[]> {
  const langs = options?.langs ?? "eng";
  const scale = options?.scale ?? 2;
  const pdf = await loadPdfDocument(source);
  const worker = await getOcrWorker(langs);
  const results: OcrPageResult[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    options?.onProgress?.({
      page: pageNumber,
      total: pdf.numPages,
      status: `Rendering page ${pageNumber}`,
    });

    const page = await pdf.getPage(pageNumber);
    const rendered = await renderPdfPagePng(page, scale);

    options?.onProgress?.({
      page: pageNumber,
      total: pdf.numPages,
      status: `OCR page ${pageNumber}`,
    });

    const blob = new Blob([rendered.png.buffer as ArrayBuffer], {
      type: "image/png",
    });
    const { data } = await worker.recognize(blob);

    const words: OcrWord[] = (data.blocks ?? [])
      .flatMap((block) => block.paragraphs)
      .flatMap((paragraph) => paragraph.lines)
      .flatMap((line) => line.words)
      .filter((word) => word.text?.trim())
      .map((word) => ({
        text: word.text,
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1,
      }));

    results.push({
      pageIndex: pageNumber - 1,
      width: rendered.width,
      height: rendered.height,
      imagePng: rendered.png,
      text: data.text ?? "",
      words,
    });
  }

  return results;
}

export async function buildSearchablePdf(
  pages: OcrPageResult[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const pageData of pages) {
    const image = await pdf.embedPng(pageData.imagePng);
    const page = pdf.addPage([pageData.width, pageData.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageData.width,
      height: pageData.height,
    });

    for (const word of pageData.words) {
      const boxWidth = Math.max(1, word.x1 - word.x0);
      const boxHeight = Math.max(1, word.y1 - word.y0);
      const fontSize = Math.max(4, boxHeight * 0.85);
      const x = word.x0;
      const y = pageData.height - word.y1;

      page.drawText(word.text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0,
        maxWidth: boxWidth * 1.2,
      });
    }
  }

  return pdf.save();
}

export function pagesToPlainText(pages: OcrPageResult[]): string {
  return pages
    .map((page, index) => `----- Page ${index + 1} -----\n${page.text.trim()}`)
    .join("\n\n");
}
