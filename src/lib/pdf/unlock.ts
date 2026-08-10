import { PDFDocument } from "pdf-lib";

/**
 * Local unlock removes restriction-style encryption when pdf-lib can load the file.
 * Password-encrypted PDFs that cannot be rewritten locally should use the cloud path.
 */
export async function unlockPdf(
  source: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  try {
    const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
    return pdf.save();
  } catch (error) {
    if (password) {
      throw new Error(
        "This PDF needs a password decrypt path. Strong unlock is routed through cloud providers in a later phase.",
      );
    }
    throw error instanceof Error
      ? error
      : new Error("Could not unlock this PDF locally.");
  }
}
