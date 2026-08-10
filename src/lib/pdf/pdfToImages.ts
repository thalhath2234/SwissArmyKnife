import { loadPdfDocument } from "@/lib/pdf/pdfjs";

export async function pdfToImages(
  source: Uint8Array,
  format: "png" | "jpeg",
  scale = 2,
): Promise<Uint8Array[]> {
  if (typeof window === "undefined") {
    throw new Error("PDF to image conversion only runs in the desktop/browser UI.");
  }

  const pdf = await loadPdfDocument(source);
  const outputs: Uint8Array[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Could not create canvas context.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Failed to encode image."))),
        format === "jpeg" ? "image/jpeg" : "image/png",
        format === "jpeg" ? 0.92 : undefined,
      );
    });

    outputs.push(new Uint8Array(await blob.arrayBuffer()));
  }

  return outputs;
}
