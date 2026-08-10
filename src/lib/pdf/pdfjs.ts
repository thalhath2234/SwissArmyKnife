import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

let workerReady = false;

type PdfjsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: unknown) => PDFDocumentLoadingTask;
  Util: {
    transform: (m1: number[], m2: number[]) => number[];
  };
};

/**
 * Use the legacy build: it polyfills Uint8Array.toHex and is more tolerant of
 * older Chromium/WebView2 runtimes. Scanned PDFs (JBIG2) also need wasmUrl.
 */
export async function getPdfjs(): Promise<PdfjsModule> {
  const pdfjs = (await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  )) as PdfjsModule;
  if (!workerReady && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    workerReady = true;
  }
  return pdfjs;
}

export function pdfDocumentOptions(data: Uint8Array) {
  const wasmUrl =
    typeof window !== "undefined"
      ? new URL("/pdfjs-wasm/", window.location.href).href
      : "/pdfjs-wasm/";

  return {
    data: data.slice(),
    wasmUrl,
    useSystemFonts: true,
    useWasm: true,
    useWorkerFetch: true,
    isEvalSupported: true,
  };
}

export async function loadPdfDocument(
  data: Uint8Array,
): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument(pdfDocumentOptions(data));
  return task.promise;
}
