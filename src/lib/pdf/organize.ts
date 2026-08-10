import { PDFDocument, degrees } from "pdf-lib";

export type PageOp = {
  sourceIndex: number;
  rotation: number;
};

export async function buildOrganizedPdf(
  source: Uint8Array,
  pages: PageOp[],
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("Keep at least one page in the document.");
  }

  const src = await PDFDocument.load(source, { ignoreEncryption: true });
  const total = src.getPageCount();

  for (const page of pages) {
    if (page.sourceIndex < 0 || page.sourceIndex >= total) {
      throw new Error(`Page index out of range: ${page.sourceIndex + 1}`);
    }
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((page) => page.sourceIndex),
  );

  pages.forEach((page, index) => {
    const target = copied[index];
    const current = target.getRotation().angle;
    const next = (((current + page.rotation) % 360) + 360) % 360;
    target.setRotation(degrees(next));
    out.addPage(target);
  });

  return out.save();
}

export async function getPdfPageCount(source: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  return pdf.getPageCount();
}
