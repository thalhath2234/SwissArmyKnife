import { compressPdf } from "@/lib/pdf/compress";
import { imagesToPdf } from "@/lib/pdf/imagesToPdf";
import { mergePdfs } from "@/lib/pdf/merge";
import { splitPdf } from "@/lib/pdf/split";
import { unlockPdf } from "@/lib/pdf/unlock";
import { runCloudJob } from "./cloud";
import type { HybridRequest, ProcessResult } from "./types";

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function runToolJob(request: HybridRequest): Promise<ProcessResult[]> {
  const { toolSlug, files, options = {}, preferLocal = true } = request;

  switch (toolSlug) {
    case "merge-pdf": {
      if (files.length < 2) {
        return [
          {
            status: "error",
            filename: "merge.pdf",
            mimeType: "application/pdf",
            message: "Select at least two PDF files to merge.",
          },
        ];
      }
      const bytes = await mergePdfs(await Promise.all(files.map(fileToBytes)));
      const filename = String(options.outputName ?? "merged.pdf");
      return [
        {
          status: "done",
          filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
          mimeType: "application/pdf",
          data: bytes,
        },
      ];
    }
    case "split-pdf": {
      const source = files[0];
      if (!source) {
        return [
          {
            status: "error",
            filename: "split.pdf",
            mimeType: "application/pdf",
            message: "Select a PDF to split.",
          },
        ];
      }
      const startPage = Number(options.startPage ?? 1);
      const endPage = Number(options.endPage ?? startPage);
      const bytes = await splitPdf(await fileToBytes(source), startPage, endPage);
      const fallback = `${source.name.replace(/\.pdf$/i, "")}-p${startPage}-${endPage}.pdf`;
      const filename = String(options.outputName ?? fallback);
      return [
        {
          status: "done",
          filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
          mimeType: "application/pdf",
          data: bytes,
        },
      ];
    }
    case "compress-pdf": {
      const source = files[0];
      if (!source) {
        return [
          {
            status: "error",
            filename: "compressed.pdf",
            mimeType: "application/pdf",
            message: "Select a PDF to compress.",
          },
        ];
      }

      const level = String(options.level ?? "light");
      if (level === "strong" || !preferLocal) {
        return [await runCloudJob(toolSlug, files, options)];
      }

      const bytes = await compressPdf(await fileToBytes(source));
      const fallback = `${source.name.replace(/\.pdf$/i, "")}-compressed.pdf`;
      const filename = String(options.outputName ?? fallback);
      return [
        {
          status: "done",
          filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
          mimeType: "application/pdf",
          data: bytes,
          message: "Applied local light compression (metadata cleanup + rewrite).",
        },
      ];
    }
    case "pdf-to-png":
    case "pdf-to-jpg": {
      const source = files[0];
      if (!source) {
        return [
          {
            status: "error",
            filename: "page",
            mimeType: "image/png",
            message: "Select a PDF to convert.",
          },
        ];
      }
      const { pdfToImages } = await import("@/lib/pdf/pdfToImages");
      const format = toolSlug === "pdf-to-jpg" ? "jpeg" : "png";
      const images = await pdfToImages(await fileToBytes(source), format);
      const base = source.name.replace(/\.pdf$/i, "");
      return images.map((image, index) => ({
        status: "done" as const,
        filename: `${base}-page-${index + 1}.${format === "jpeg" ? "jpg" : "png"}`,
        mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
        data: image,
      }));
    }
    case "images-to-pdf": {
      if (files.length < 1) {
        return [
          {
            status: "error",
            filename: "images.pdf",
            mimeType: "application/pdf",
            message: "Select one or more images.",
          },
        ];
      }
      const payloads = await Promise.all(
        files.map(async (file) => ({
          bytes: await fileToBytes(file),
          mimeType: file.type || "image/png",
        })),
      );
      const bytes = await imagesToPdf(payloads);
      const filename = String(options.outputName ?? "images.pdf");
      return [
        {
          status: "done",
          filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
          mimeType: "application/pdf",
          data: bytes,
        },
      ];
    }
    case "unlock-pdf": {
      const source = files[0];
      if (!source) {
        return [
          {
            status: "error",
            filename: "unlocked.pdf",
            mimeType: "application/pdf",
            message: "Select a PDF to unlock.",
          },
        ];
      }
      const password = String(options.password ?? "");
      try {
        const bytes = await unlockPdf(await fileToBytes(source), password);
        const fallback = `${source.name.replace(/\.pdf$/i, "")}-unlocked.pdf`;
        const filename = String(options.outputName ?? fallback);
        return [
          {
            status: "done",
            filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
            mimeType: "application/pdf",
            data: bytes,
            message: password
              ? "Rewrote PDF locally. If pages still look locked, use a cloud unlock provider next."
              : "Rewrote PDF locally without encryption flags.",
          },
        ];
      } catch {
        return [await runCloudJob(toolSlug, files, options)];
      }
    }
    default:
      return [await runCloudJob(toolSlug, files, options)];
  }
}
