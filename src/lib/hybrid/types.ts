export type JobStatus = "queued" | "running" | "done" | "error" | "needs_cloud";

export interface ProcessResult {
  status: JobStatus;
  filename: string;
  mimeType: string;
  data?: Uint8Array;
  message?: string;
  provider?: string;
}

export interface CloudProvider {
  id: string;
  name: string;
  configured: boolean;
  supports: string[];
}

export interface HybridRequest {
  toolSlug: string;
  preferLocal?: boolean;
  files: File[];
  options?: Record<string, unknown>;
}
