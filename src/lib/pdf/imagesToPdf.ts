import { PDFDocument } from "pdf-lib";

interface ImageInput {
  bytes: Uint8Array;
  mimeType: string;
}

export async function imagesToPdf(images: ImageInput[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  for (const image of images) {
    const isJpg =
      image.mimeType.includes("jpeg") ||
      image.mimeType.includes("jpg") ||
      looksLikeJpeg(image.bytes);

    const embedded = isJpg
      ? await pdf.embedJpg(image.bytes)
      : await pdf.embedPng(image.bytes);

    const page = pdf.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }

  return pdf.save();
}

function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}
