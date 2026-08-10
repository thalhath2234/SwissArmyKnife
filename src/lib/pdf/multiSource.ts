import { PDFDocument, degrees } from "pdf-lib";

export type MultiSourcePage = {
  fileId: string;
  sourceIndex: number;
  rotation: number;
};

export async function buildPdfFromMultiSource(
  pages: MultiSourcePage[],
  sources: Map<string, Uint8Array>,
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("No pages selected.");
  }

  const out = await PDFDocument.create();
  const loaded = new Map<string, PDFDocument>();

  async function getDoc(fileId: string) {
    const cached = loaded.get(fileId);
    if (cached) return cached;
    const bytes = sources.get(fileId);
    if (!bytes) throw new Error("Missing source PDF.");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    loaded.set(fileId, doc);
    return doc;
  }

  for (const page of pages) {
    const doc = await getDoc(page.fileId);
    const [copied] = await out.copyPages(doc, [page.sourceIndex]);
    const current = copied.getRotation().angle;
    const next = (((current + page.rotation) % 360) + 360) % 360;
    copied.setRotation(degrees(next));
    out.addPage(copied);
  }

  return out.save();
}
