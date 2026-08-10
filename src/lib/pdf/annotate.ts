import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type Point = { x: number; y: number };

export type Annotation =
  | {
      id: string;
      type: "highlight";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
    }
  | {
      id: string;
      type: "stroke";
      pageIndex: number;
      points: Point[];
      color: string;
      lineWidth: number;
    }
  | {
      id: string;
      type: "text";
      pageIndex: number;
      x: number;
      y: number;
      text: string;
      color: string;
    };

function parseHex(color: string) {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const value = Number.parseInt(full, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

export async function applyAnnotationsToPdf(
  source: Uint8Array,
  annotations: Annotation[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const annotation of annotations) {
    const page = pdf.getPage(annotation.pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const { r, g, b } = parseHex(annotation.color);

    if (annotation.type === "highlight") {
      const w = pageWidth * annotation.width;
      const h = pageHeight * annotation.height;
      const x = pageWidth * annotation.x;
      const y = pageHeight - pageHeight * annotation.y - h;
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(r, g, b),
        opacity: 0.35,
        borderWidth: 0,
      });
    }

    if (annotation.type === "stroke" && annotation.points.length > 1) {
      for (let i = 1; i < annotation.points.length; i += 1) {
        const a = annotation.points[i - 1];
        const c = annotation.points[i];
        page.drawLine({
          start: {
            x: pageWidth * a.x,
            y: pageHeight - pageHeight * a.y,
          },
          end: {
            x: pageWidth * c.x,
            y: pageHeight - pageHeight * c.y,
          },
          thickness: Math.max(1, annotation.lineWidth * pageWidth),
          color: rgb(r, g, b),
          opacity: 0.95,
        });
      }
    }

    if (annotation.type === "text" && annotation.text.trim()) {
      const size = Math.max(10, pageHeight * 0.025);
      const x = pageWidth * annotation.x;
      const y = pageHeight - pageHeight * annotation.y - size;
      page.drawText(annotation.text, {
        x,
        y,
        size,
        font,
        color: rgb(r, g, b),
        maxWidth: pageWidth * 0.45,
        lineHeight: size * 1.2,
      });
    }
  }

  return pdf.save();
}
