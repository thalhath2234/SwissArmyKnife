import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";
import { deflate } from "pako";

export type TextReplacement = {
  pageIndex: number;
  find: string;
  replace: string;
};

type WritableRawStream = PDFRawStream & {
  contents: Uint8Array;
};

function arrayAsString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

function escapePdfLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toUtf16BeHex(value: string): string {
  let hex = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code > 0xffff) {
      const adjusted = code - 0x10000;
      const high = 0xd800 + (adjusted >> 10);
      const low = 0xdc00 + (adjusted & 0x3ff);
      hex += high.toString(16).padStart(4, "0");
      hex += low.toString(16).padStart(4, "0");
    } else {
      hex += code.toString(16).padStart(4, "0");
    }
  }
  return hex.toUpperCase();
}

function replaceOnce(
  source: string,
  find: string,
  replace: string,
): { text: string; ok: boolean } {
  if (!find) return { text: source, ok: false };
  const index = source.indexOf(find);
  if (index < 0) return { text: source, ok: false };
  return {
    text: source.slice(0, index) + replace + source.slice(index + find.length),
    ok: true,
  };
}

function buildNeedlePairs(
  find: string,
  replace: string,
): Array<{ find: string; replace: string }> {
  const pairs: Array<{ find: string; replace: string }> = [];
  const litFind = `(${escapePdfLiteral(find)})`;
  const litReplace = `(${escapePdfLiteral(replace)})`;
  pairs.push({ find: litFind, replace: litReplace });

  const hexFind = toUtf16BeHex(find);
  const hexReplace = toUtf16BeHex(replace);
  if (hexFind) {
    pairs.push({ find: `<${hexFind}>`, replace: `<${hexReplace}>` });
    pairs.push({
      find: `<${hexFind.toLowerCase()}>`,
      replace: `<${hexReplace.toLowerCase()}>`,
    });
  }

  // Common single-byte hex for ASCII digits/letters in some CID fonts.
  if (/^[\x20-\x7e]+$/.test(find) && /^[\x20-\x7e]*$/.test(replace)) {
    const asciiHex = (value: string) =>
      Array.from(value, (ch) =>
        ch.charCodeAt(0).toString(16).padStart(2, "0"),
      ).join("");
    pairs.push({
      find: `<${asciiHex(find)}>`,
      replace: `<${asciiHex(replace)}>`,
    });
    pairs.push({
      find: `<${asciiHex(find).toUpperCase()}>`,
      replace: `<${asciiHex(replace).toUpperCase()}>`,
    });
  }

  // Last resort: raw unicode substring in the stream.
  pairs.push({ find, replace });
  return pairs;
}

function applyReplacementToStreamText(
  streamText: string,
  find: string,
  replace: string,
): { text: string; ok: boolean } {
  for (const pair of buildNeedlePairs(find, replace)) {
    const result = replaceOnce(streamText, pair.find, pair.replace);
    if (result.ok) return result;
  }
  return { text: streamText, ok: false };
}

function collectPageStreams(
  pdf: PDFDocument,
  pageIndex: number,
): WritableRawStream[] {
  const page = pdf.getPage(pageIndex);
  const contents = page.node.Contents();
  const streams: WritableRawStream[] = [];

  const pushStream = (value: unknown) => {
    const resolved =
      value instanceof PDFRef ? pdf.context.lookup(value) : value;
    if (resolved instanceof PDFRawStream) {
      streams.push(resolved as WritableRawStream);
    }
  };

  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      pushStream(contents.get(i));
    }
  } else if (contents) {
    pushStream(contents);
  }

  return streams;
}

function rewriteRawStream(stream: WritableRawStream, nextText: string) {
  const compressed = deflate(nextText);
  stream.contents = compressed;
  stream.dict.set(PDFName.of("Length"), stream.dict.context.obj(compressed.length));
  stream.dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
}

/**
 * Replace text inside page content streams (same font/size/color operators).
 * Returns how many replacements succeeded.
 */
export async function replaceTextInPdf(
  source: Uint8Array,
  replacements: TextReplacement[],
): Promise<{ bytes: Uint8Array; replaced: number; failed: TextReplacement[] }> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  let replaced = 0;
  const failed: TextReplacement[] = [];

  for (const edit of replacements) {
    if (edit.find === edit.replace) {
      replaced += 1;
      continue;
    }
    if (edit.pageIndex < 0 || edit.pageIndex >= pdf.getPageCount()) {
      failed.push(edit);
      continue;
    }

    const streams = collectPageStreams(pdf, edit.pageIndex);
    let ok = false;

    for (const stream of streams) {
      try {
        let decoded: string;
        try {
          decoded = arrayAsString(decodePDFRawStream(stream).decode());
        } catch {
          decoded = arrayAsString(stream.contents);
        }

        const next = applyReplacementToStreamText(
          decoded,
          edit.find,
          edit.replace,
        );
        if (!next.ok) continue;

        rewriteRawStream(stream, next.text);
        ok = true;
        replaced += 1;
        break;
      } catch {
        // try next stream
      }
    }

    if (!ok) failed.push(edit);
  }

  // Also try document-wide streams for failed page-scoped edits (some PDFs
  // share form XObjects for text).
  if (failed.length) {
    const stillFailed: TextReplacement[] = [];
    const objects = pdf.context.enumerateIndirectObjects();

    for (const edit of failed) {
      let ok = false;
      for (const [, pdfObject] of objects) {
        if (!(pdfObject instanceof PDFRawStream)) continue;
        const dict = pdfObject.dict;
        if (!(dict instanceof PDFDict)) continue;
        if (dict.get(PDFName.of("Subtype")) === PDFName.of("Image")) continue;

        try {
          let decoded: string;
          try {
            decoded = arrayAsString(decodePDFRawStream(pdfObject).decode());
          } catch {
            continue;
          }
          const next = applyReplacementToStreamText(
            decoded,
            edit.find,
            edit.replace,
          );
          if (!next.ok) continue;
          rewriteRawStream(pdfObject as WritableRawStream, next.text);
          ok = true;
          replaced += 1;
          break;
        } catch {
          // continue
        }
      }
      if (!ok) stillFailed.push(edit);
    }

    return {
      bytes: await pdf.save(),
      replaced,
      failed: stillFailed,
    };
  }

  return {
    bytes: await pdf.save(),
    replaced,
    failed,
  };
}
