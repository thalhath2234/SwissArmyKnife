import { PDFDocument } from "pdf-lib";

export type SignaturePlacement = {
  pageIndex: number;
  /** Normalized 0-1 from left of page */
  x: number;
  /** Normalized 0-1 from top of page */
  y: number;
  /** Normalized width 0-1 of page width */
  width: number;
  /** Normalized height 0-1 of page height */
  height: number;
};

export async function applySignatureToPdf(
  source: Uint8Array,
  signaturePng: Uint8Array,
  placement: SignaturePlacement,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const page = pdf.getPage(placement.pageIndex);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const image = await pdf.embedPng(signaturePng);

  const drawWidth = pageWidth * placement.width;
  const drawHeight = pageHeight * placement.height;
  const x = pageWidth * placement.x;
  const y = pageHeight - pageHeight * placement.y - drawHeight;

  page.drawImage(image, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  });

  return pdf.save();
}

export function renderTypedSignature(
  text: string,
  options?: { width?: number; height?: number; color?: string },
): Uint8Array {
  const width = options?.width ?? 600;
  const height = options?.height ?? 200;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create signature canvas.");

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = options?.color ?? "#111827";
  ctx.font = `italic 72px "Segoe Script", "Brush Script MT", cursive`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text.trim() || "Signature", width / 2, height / 2);

  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
  if (!ctx) throw new Error("Could not convert signature image.");
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

export function canvasToPngBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
