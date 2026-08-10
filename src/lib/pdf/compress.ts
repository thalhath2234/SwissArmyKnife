import { PDFDocument } from "pdf-lib";

/** Local light compression: strip metadata and rewrite the PDF. */
export async function compressPdf(source: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  pdf.setTitle("");
  pdf.setAuthor("");
  pdf.setSubject("");
  pdf.setKeywords([]);
  pdf.setProducer("Swiss Army Knife");
  pdf.setCreator("Swiss Army Knife");

  return pdf.save({ useObjectStreams: true });
}
