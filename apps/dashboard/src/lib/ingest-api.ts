function getIngestUrl(): string {
  if (typeof window === "undefined") return "http://localhost:3457";
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "http://localhost:3457";
  if (/^(192\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h))
    return `http://${h}:3457`;
  return "https://kb-ingest.runvision.ai";
}

export type IngestEventType =
  | "file_start"
  | "text_extracted"
  | "chunks_created"
  | "pages_rendered"
  | "qa_generating"
  | "qa_generated"
  | "dedup_checking"
  | "file_done"
  | "complete"
  | "error";

export interface IngestEvent {
  type: IngestEventType;
  data: Record<string, unknown>;
}

export interface QACandidate {
  id: string;
  question: string;
  answer: string;
  category: string;
  imageUrl?: string;
  chunkIndex: number;
  fileName: string;
  isDuplicate: boolean;
  duplicateOf?: { id: string; question: string; similarity: number };
}

export interface ApproveItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  imageUrl?: string;
}

export interface IngestJob {
  id: string;
  status: string;
  candidateCount: number;
  candidates: QACandidate[];
  events: IngestEvent[];
  availableImages?: Record<string, string>;
}

export interface HealthResponse {
  status: string;
  claudeProxy: string;
  database: string;
  timestamp: string;
}

export const ingestApi = {
  health: (): Promise<HealthResponse> =>
    fetch(`${getIngestUrl()}/health`).then((r) => r.json()),

  upload: async (files: File[]): Promise<{ jobId: string }> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files[]", file);
    }
    const res = await fetch(`${getIngestUrl()}/ingest/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  streamProgress: (
    jobId: string,
    onEvent: (event: IngestEvent) => void,
  ): EventSource => {
    const es = new EventSource(`${getIngestUrl()}/ingest/jobs/${jobId}/stream`);
    es.onmessage = (msg) => {
      try {
        const event: IngestEvent = JSON.parse(msg.data);
        onEvent(event);
      } catch {
        // ignore parse errors
      }
    };
    return es;
  },

  getJob: (jobId: string): Promise<IngestJob> =>
    fetch(`${getIngestUrl()}/ingest/jobs/${jobId}`).then((r) => r.json()),

  approve: async (
    jobId: string,
    items: ApproveItem[],
  ): Promise<{ saved: number }> => {
    const res = await fetch(`${getIngestUrl()}/ingest/jobs/${jobId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Approve failed: ${res.status}`);
    }
    return res.json();
  },
};
