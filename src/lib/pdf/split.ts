import { PDFDocument } from "pdf-lib";

export async function splitPdf(
  source: Uint8Array,
  startPage: number,
  endPage: number,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const total = pdf.getPageCount();

  if (startPage < 1 || endPage > total || startPage > endPage) {
    throw new Error(`Page range must be between 1 and ${total}.`);
  }

  const out = await PDFDocument.create();
  const indices = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage - 1 + i,
  );
  const pages = await out.copyPages(pdf, indices);
  pages.forEach((page) => out.addPage(page));

  return out.save();
}
