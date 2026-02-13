import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import { createKBItem } from "@kb-chatbot/kb-engine";
import type { Database } from "@kb-chatbot/database";
import {
  runIngestPipeline,
  type IngestEvent,
  type QACandidate,
  type IngestFileInput,
} from "../../core/ingest-pipeline.js";
import { OPENAI_DIRECT_URL } from "../../utils.js";
import { uploadImageToR2, type R2Config } from "../../storage/r2.js";

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

interface SSEClient {
  write(data: string): void;
}

interface Job {
  id: string;
  status: "uploading" | "processing" | "done" | "error";
  files: IngestFileInput[];
  candidates: QACandidate[];
  events: IngestEvent[];
  pageImages?: Record<string, string>;
  imageBuffers: Map<string, Buffer>;
  sseClients: Set<SSEClient>;
  createdAt: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// In-memory job store
// ---------------------------------------------------------------------------

const jobs = new Map<string, Job>();

// Auto-GC jobs older than 1 hour
const JOB_TTL_MS = 60 * 60 * 1000;

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupJobs, 10 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Helper: push an event to all SSE clients and buffer it on the job
// ---------------------------------------------------------------------------

function broadcastEvent(job: Job, event: IngestEvent) {
  job.events.push(event);
  const message = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of job.sseClients) {
    try {
      client.write(message);
    } catch {
      // Client disconnected — will be removed when the stream closes
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: run the ingest pipeline in the background
// ---------------------------------------------------------------------------

async function runPipelineInBackground(
  job: Job,
  db: Database,
  openaiApiKey: string,
  port: number,
  r2Config?: R2Config,
) {
  job.status = "processing";

  try {
    const generator = runIngestPipeline(
      job.files,
      { openaiApiKey, r2Config },
      db,
    );

    let result = await generator.next();
    while (!result.done) {
      // Capture page image buffers from pages_rendered events for local serving
      if (result.value.type === "pages_rendered") {
        const data = result.value.data;
        const buffers = data.pageBuffers as Record<number, Buffer> | undefined;
        if (buffers) {
          for (const [pageNum, buf] of Object.entries(buffers)) {
            job.imageBuffers.set(`page-${pageNum}`, buf);
          }
          // Remove buffers from event data before broadcasting (too large for SSE)
          delete data.pageBuffers;
        }
      }

      broadcastEvent(job, result.value);
      result = await generator.next();
    }

    // The generator return value contains all candidates
    job.candidates = result.value;

    // Resolve local:// URLs to actual HTTP URLs
    const baseUrl = `http://localhost:${port}/ingest/jobs/${job.id}/images`;
    for (const candidate of job.candidates) {
      if (candidate.imageUrl?.startsWith("local://")) {
        const path = candidate.imageUrl.replace("local://", "");
        if (path.startsWith("page/")) {
          const pageNum = path.replace("page/", "");
          const key = `page-${pageNum}`;
          if (job.imageBuffers.has(key)) {
            candidate.imageUrl = `${baseUrl}/${key}.png`;
          } else {
            candidate.imageUrl = undefined;
          }
        } else if (path === "image/original") {
          const key = "original";
          if (job.imageBuffers.has(key)) {
            candidate.imageUrl = `${baseUrl}/${key}.png`;
          } else {
            candidate.imageUrl = undefined;
          }
        }
      }
    }

    job.status = "done";
  } catch (err) {
    job.status = "error";
    job.error = String(err);
    broadcastEvent(job, {
      type: "error",
      data: { message: String(err), stage: "pipeline" },
    });
  } finally {
    // Release file buffers to free memory
    job.files = [];
  }
}

// ---------------------------------------------------------------------------
// Mime-type guessing for uploaded files
// ---------------------------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".md": "text/plain",
  ".csv": "text/plain",
  ".json": "text/plain",
  ".html": "text/html",
};

function guessMimeType(fileName: string): string {
  const ext = fileName.lastIndexOf(".") >= 0
    ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
    : "";
  return MIME_MAP[ext] ?? "text/plain";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const MAX_CONCURRENT_JOBS = 3;

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createIngestRoutes(db: Database, openaiApiKey: string, port: number, r2Config?: R2Config) {
  const app = new Hono();

  // ── POST /upload — multipart file upload ───────────────────────────────
  app.post("/upload", async (c) => {
    // Check concurrent job limit
    const activeJobs = [...jobs.values()].filter((j) => j.status === "processing").length;
    if (activeJobs >= MAX_CONCURRENT_JOBS) {
      return c.json({ error: "동시 처리 가능한 작업 수를 초과했습니다. 현재 작업이 완료될 때까지 기다려주세요." }, 429);
    }

    const body = await c.req.parseBody({ all: true });

    // Hono parseBody with `all: true` returns arrays for repeated field names
    const rawFiles = body["files[]"];
    const fileArray: File[] = [];

    if (rawFiles instanceof File) {
      fileArray.push(rawFiles);
    } else if (Array.isArray(rawFiles)) {
      for (const f of rawFiles) {
        if (f instanceof File) {
          fileArray.push(f);
        }
      }
    }

    if (fileArray.length === 0) {
      return c.json({ error: "No files uploaded. Use field name 'files[]'" }, 400);
    }

    // Validate file sizes
    let totalSize = 0;
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        return c.json(
          { error: `파일 '${file.name}'이 ${MAX_FILE_SIZE / 1024 / 1024}MB 제한을 초과합니다.` },
          400,
        );
      }
      totalSize += file.size;
    }
    if (totalSize > MAX_TOTAL_SIZE) {
      return c.json(
        { error: `총 업로드 크기가 ${MAX_TOTAL_SIZE / 1024 / 1024}MB 제한을 초과합니다.` },
        400,
      );
    }

    // Read all files into memory
    const files: IngestFileInput[] = [];
    for (const file of fileArray) {
      const arrayBuffer = await file.arrayBuffer();
      files.push({
        name: file.name,
        buffer: Buffer.from(arrayBuffer),
        mimeType: file.type || guessMimeType(file.name),
      });
    }

    // Create job
    const job: Job = {
      id: randomUUID(),
      status: "uploading",
      files,
      candidates: [],
      events: [],
      imageBuffers: new Map(),
      sseClients: new Set(),
      createdAt: Date.now(),
    };

    jobs.set(job.id, job);

    // Store image file buffers for local serving
    for (const file of files) {
      const mime = file.mimeType;
      if (mime.startsWith("image/")) {
        job.imageBuffers.set("original", file.buffer);
      }
    }

    // Fire and forget — start pipeline in background
    runPipelineInBackground(job, db, openaiApiKey, port, r2Config).catch((err) => {
      console.error(`[ingest] Pipeline error for job ${job.id}:`, err);
    });

    return c.json({ jobId: job.id });
  });

  // ── GET /jobs/:id/stream — SSE for real-time progress ──────────────────
  app.get("/jobs/:id/stream", (c) => {
    const jobId = c.req.param("id");
    const job = jobs.get(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      // Register this stream as an SSE client
      const client: SSEClient = {
        write(data: string) {
          // streamSSE writeSSE expects SSEMessage, but we do raw writes
          // via the stream.write method
          stream.write(data).catch(() => {
            // ignore write errors on closed streams
          });
        },
      };

      // Send buffered events first (catch-up for late-connecting clients)
      for (const event of job.events) {
        await stream.writeSSE({
          data: JSON.stringify(event),
        });
      }

      // If the job is already done or errored, close immediately
      if (job.status === "done" || job.status === "error") {
        return;
      }

      // Register for live events only after catch-up is complete
      job.sseClients.add(client);

      // Keep the connection open until the job completes
      // We poll the job status to detect completion
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (job.status === "done" || job.status === "error") {
            clearInterval(interval);
            job.sseClients.delete(client);
            resolve();
          }
        }, 500);

        // Also handle stream abort/close
        stream.onAbort(() => {
          clearInterval(interval);
          job.sseClients.delete(client);
          resolve();
        });
      });
    });
  });

  // ── GET /jobs/:id/images/:key — serve locally rendered images ───────────
  app.get("/jobs/:id/images/:key", (c) => {
    const jobId = c.req.param("id");
    const key = c.req.param("key").replace(/\.png$/, ""); // strip .png extension
    const job = jobs.get(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    const buf = job.imageBuffers.get(key);
    if (!buf) {
      return c.json({ error: "Image not found" }, 404);
    }

    return new Response(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  });

  // ── GET /jobs/:id — current job state ──────────────────────────────────
  app.get("/jobs/:id", (c) => {
    const jobId = c.req.param("id");
    const job = jobs.get(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({
      id: job.id,
      status: job.status,
      candidateCount: job.candidates.length,
      candidates: job.candidates,
      events: job.events,
      pageImages: job.pageImages,
      error: job.error,
    });
  });

  // ── POST /jobs/:id/approve — save selected Q&A to DB ──────────────────
  app.post("/jobs/:id/approve", async (c) => {
    const jobId = c.req.param("id");
    const job = jobs.get(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    if (job.status !== "done") {
      return c.json({ error: "Job is not done yet" }, 400);
    }

    const body = await c.req.json<{
      items: Array<{
        id: string;
        question: string;
        answer: string;
        category: string;
        imageUrl?: string;
      }>;
    }>();

    if (!body.items || !Array.isArray(body.items)) {
      return c.json({ error: "'items' array is required" }, 400);
    }

    // Validate each item
    for (const item of body.items) {
      if (
        !item.id ||
        typeof item.question !== "string" || !item.question.trim() ||
        typeof item.answer !== "string" || !item.answer.trim() ||
        typeof item.category !== "string"
      ) {
        return c.json(
          { error: "각 항목에 question, answer, category가 필수입니다." },
          400,
        );
      }
      // Validate imageUrl if provided (allow http/https and local:// references)
      if (item.imageUrl && !item.imageUrl.startsWith("local://")) {
        try {
          const url = new URL(item.imageUrl);
          if (url.protocol !== "https:" && url.protocol !== "http:") {
            return c.json({ error: `유효하지 않은 이미지 URL: ${item.imageUrl}` }, 400);
          }
        } catch {
          return c.json({ error: `유효하지 않은 이미지 URL: ${item.imageUrl}` }, 400);
        }
      }
    }

    // Upload local images to R2 at approve time (only for approved items)
    const uploadedUrls = new Map<string, string>(); // bufferKey → r2Url
    const jobRef = job; // bind for closure

    async function resolveImageUrl(localUrl: string | undefined): Promise<string | undefined> {
      if (!localUrl) return undefined;

      // Already an external URL (user-edited or from previous upload)
      if (localUrl.startsWith("http://") || localUrl.startsWith("https://")) {
        // Skip local server URLs — these need R2 upload
        if (!localUrl.includes(`/ingest/jobs/`)) return localUrl;
      }

      // Extract buffer key from local URL or local:// reference
      let bufferKey: string | undefined;
      if (localUrl.startsWith("local://page/")) {
        bufferKey = `page-${localUrl.replace("local://page/", "")}`;
      } else if (localUrl.startsWith("local://image/")) {
        bufferKey = localUrl.replace("local://image/", "");
      } else if (localUrl.includes("/ingest/jobs/") && localUrl.includes("/images/")) {
        // localhost server URL: extract key from path
        const match = localUrl.match(/\/images\/(.+?)\.png$/);
        if (match) bufferKey = match[1];
      }

      if (!bufferKey) return localUrl;

      // Already uploaded in this batch?
      if (uploadedUrls.has(bufferKey)) return uploadedUrls.get(bufferKey)!;

      // Get buffer from job
      const buf = jobRef.imageBuffers.get(bufferKey);
      if (!buf) return undefined;

      // Upload to R2 if configured
      if (r2Config) {
        try {
          const r2Key = `kb-images/${jobRef.id}/${bufferKey}.png`;
          const r2Url = await uploadImageToR2(buf, r2Key, "image/png", r2Config);
          uploadedUrls.set(bufferKey, r2Url);
          return r2Url;
        } catch (err) {
          console.error(`[ingest] R2 upload failed for ${bufferKey}:`, err);
        }
      }

      // No R2 — return local URL as-is (only works while server is running)
      return localUrl;
    }

    let saved = 0;

    for (const item of body.items) {
      // Find the matching candidate to verify it exists
      const candidate = job.candidates.find((cand) => cand.id === item.id);
      if (!candidate) {
        continue; // Skip items not found in candidates
      }

      try {
        // Resolve image URL: upload local images to R2 at this point
        const resolvedImageUrl = await resolveImageUrl(
          item.imageUrl || candidate.imageUrl,
        );

        await createKBItem(
          db,
          {
            question: item.question,
            answer: item.answer,
            category: item.category,
            imageUrl: resolvedImageUrl,
            createdBy: "kb-cli-ingest",
          },
          openaiApiKey,
          { baseUrl: OPENAI_DIRECT_URL },
        );
        saved++;
      } catch (err) {
        console.error(`[ingest] Failed to save Q&A "${item.question.slice(0, 40)}...":`, err);
      }
    }

    return c.json({ saved });
  });

  return app;
}
