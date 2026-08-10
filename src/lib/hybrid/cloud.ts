import type { CloudProvider, ProcessResult } from "./types";

const providers: CloudProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    configured: false,
    supports: ["ocr-pdf", "translate-pdf", "transcription", "ai-audio"],
  },
  {
    id: "adobe",
    name: "Adobe PDF Services",
    configured: false,
    supports: [
      "pdf-to-word",
      "pdf-to-excel",
      "pdf-to-pptx",
      "word-to-pdf",
      "compress-pdf",
      "unlock-pdf",
    ],
  },
];

export function listCloudProviders(): CloudProvider[] {
  return providers;
}

export async function runCloudJob(
  toolSlug: string,
  _files: File[],
  _options: Record<string, unknown> = {},
): Promise<ProcessResult> {
  const provider = providers.find((item) => item.supports.includes(toolSlug));

  if (!provider) {
    return {
      status: "error",
      filename: "unavailable",
      mimeType: "text/plain",
      message: `No cloud provider registered for ${toolSlug}.`,
    };
  }

  if (!provider.configured) {
    return {
      status: "needs_cloud",
      filename: "configure-provider",
      mimeType: "text/plain",
      provider: provider.id,
      message: `${provider.name} is not configured yet. Add API keys in Settings (coming soon).`,
    };
  }

  return {
    status: "error",
    filename: "not-implemented",
    mimeType: "text/plain",
    provider: provider.id,
    message: `Cloud execution for ${toolSlug} via ${provider.name} is stubbed for a later phase.`,
  };
}
