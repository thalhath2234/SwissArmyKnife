import { PDFDocument } from "@cantoo/pdf-lib";

export async function protectPdf(
  source: Uint8Array,
  userPassword: string,
  ownerPassword?: string,
): Promise<Uint8Array> {
  const password = userPassword.trim();
  if (!password) {
    throw new Error("Enter a password to protect this PDF.");
  }

  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  pdf.encrypt({
    userPassword: password,
    ownerPassword: (ownerPassword?.trim() || password),
  });

  return pdf.save();
}
