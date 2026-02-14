import { randomUUID } from "node:crypto";
import { searchKnowledgeBase } from "@kb-chatbot/kb-engine";
import type { Database } from "@kb-chatbot/database";
import { chunkText } from "../processors/chunker.js";
import { generateQAPairs, generateQAFromPages, analyzeImage } from "../ai/claude.js";
import { embedText } from "../ai/openai.js";
import { renderPdfPages } from "../processors/pdf-pages.js";
import { uploadImageToR2, type R2Config } from "../storage/r2.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IngestEvent {
  type:
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

export interface IngestFileInput {
  name: string;
  buffer: Buffer;
  mimeType: string;
}

export interface IngestConfig {
  openaiApiKey: string;
  r2Config?: R2Config;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEDUP_THRESHOLD = 0.85;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// ---------------------------------------------------------------------------
// Text extraction from buffer (non-PDF)
// ---------------------------------------------------------------------------

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf") {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = content.items.map((item: any) => item.str).join(" ");
      pageTexts.push(text);
    }
    return pageTexts.join("\f");
  }

  if (IMAGE_MIME_TYPES.has(mimeType)) {
    const base64 = buffer.toString("base64");
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    return analyzeImage(base64, mediaType);
  }

  return buffer.toString("utf-8");
}

// ---------------------------------------------------------------------------
// PDF-specific: extract per-page text
// ---------------------------------------------------------------------------

async function extractPageTexts(buffer: Buffer): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = content.items.map((item: any) => item.str).join(" ");
    pageTexts.push(text);
  }
  return pageTexts;
}

// ---------------------------------------------------------------------------
// Dedup helper
// ---------------------------------------------------------------------------

async function* dedupCandidates(
  candidates: QACandidate[],
  config: IngestConfig,
  db: Database,
  fileName: string,
): AsyncGenerator<IngestEvent> {
  for (const candidate of candidates) {
    try {
      const embedding = await embedText(candidate.question, config.openaiApiKey);
      const existing = await searchKnowledgeBase(db, embedding, {
        threshold: DEDUP_THRESHOLD,
        maxResults: 1,
      });

      if (existing.length > 0) {
        candidate.isDuplicate = true;
        candidate.duplicateOf = {
          id: existing[0].id,
          question: existing[0].question,
          similarity: existing[0].similarity,
        };
      }
    } catch (err) {
      yield {
        type: "error",
        data: {
          fileName,
          stage: "dedup_check",
          question: candidate.question.slice(0, 60),
          message: String(err),
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Core ingest pipeline (async generator)
// ---------------------------------------------------------------------------

export async function* runIngestPipeline(
  files: IngestFileInput[],
  config: IngestConfig,
  db: Database,
): AsyncGenerator<IngestEvent, QACandidate[]> {
  const allCandidates: QACandidate[] = [];

  for (const file of files) {
    yield {
      type: "file_start",
      data: { fileName: file.name, mimeType: file.mimeType },
    };

    // ================================================================
    // PDF path: page images + page texts → Claude 통째로 처리
    // ================================================================
    if (file.mimeType === "application/pdf") {
      // --- Extract per-page text ---
      let pageTexts: string[];
      try {
        pageTexts = await extractPageTexts(file.buffer);
      } catch (err) {
        yield { type: "error", data: { fileName: file.name, stage: "text_extraction", message: String(err) } };
        continue;
      }

      const totalChars = pageTexts.reduce((sum, t) => sum + t.length, 0);
      yield { type: "text_extracted", data: { fileName: file.name, textLength: totalChars } };

      // --- Render page images ---
      let pageBuffers: Map<number, Buffer>;
      try {
        const pages = await renderPdfPages(file.buffer);
        pageBuffers = new Map(pages.map((p) => [p.pageNum, p.image]));

        yield {
          type: "pages_rendered",
          data: {
            fileName: file.name,
            pageCount: pages.length,
            pageBuffers: Object.fromEntries(pageBuffers),
          },
        };
      } catch (err) {
        yield { type: "error", data: { fileName: file.name, stage: "page_rendering", message: String(err) } };
        continue; // Can't proceed without images for PDF path
      }

      // --- Upload page images to R2 (if configured) ---
      const pageImageUrls = new Map<number, string>();
      if (config.r2Config) {
        const fileSlug = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_").replace(/\.[^.]+$/, "");
        const batchId = randomUUID().slice(0, 8);
        for (const [pageNum, buf] of pageBuffers.entries()) {
          try {
            const r2Key = `ingest/${fileSlug}-${batchId}/page-${pageNum}.png`;
            const url = await uploadImageToR2(buf, r2Key, "image/png", config.r2Config);
            pageImageUrls.set(pageNum, url);
          } catch (err) {
            yield { type: "error", data: { fileName: file.name, stage: "r2_upload", pageNum, message: String(err) } };
          }
        }
      }

      // --- Generate Q&A from all pages at once ---
      yield {
        type: "qa_generating",
        data: { fileName: file.name, chunkIndex: 0, totalChunks: 1 },
      };

      const pagesInput = [...pageBuffers.entries()].map(([pageNum, buf]) => ({
        pageNum,
        base64: buf.toString("base64"),
        text: pageTexts[pageNum - 1] || "",
      }));

      let qaPairs: Array<{ question: string; answer: string; category: string; pageNumber: number }>;
      try {
        console.log(`[pipeline] Calling generateQAFromPages with ${pagesInput.length} pages`);
        qaPairs = await generateQAFromPages(pagesInput);
        console.log(`[pipeline] generateQAFromPages returned ${qaPairs.length} Q&A pairs`);
      } catch (err) {
        console.error(`[pipeline] generateQAFromPages error:`, err);
        yield { type: "error", data: { fileName: file.name, stage: "qa_generation", message: String(err) } };
        continue;
      }

      // --- Build candidates with image URLs ---
      const candidates: QACandidate[] = qaPairs.map((qa) => {
        // R2 URL 우선, 없으면 local:// 폴백
        const r2Url = pageImageUrls.get(qa.pageNumber);
        const fallbackR2 = pageImageUrls.size > 0
          ? pageImageUrls.values().next().value
          : undefined;

        return {
          id: randomUUID(),
          question: qa.question,
          answer: qa.answer,
          category: qa.category,
          imageUrl: r2Url
            ?? fallbackR2
            ?? (pageBuffers.has(qa.pageNumber) ? `local://page/${qa.pageNumber}` : undefined),
          chunkIndex: 0,
          fileName: file.name,
          isDuplicate: false,
        };
      });

      yield {
        type: "qa_generated",
        data: { fileName: file.name, chunkIndex: 0, candidates, count: candidates.length },
      };

      // --- Dedup ---
      yield { type: "dedup_checking", data: { fileName: file.name, count: candidates.length } };
      for await (const event of dedupCandidates(candidates, config, db, file.name)) {
        yield event;
      }

      allCandidates.push(...candidates);

      yield {
        type: "file_done",
        data: { fileName: file.name, candidateCount: candidates.length },
      };

      continue; // Next file
    }

    // ================================================================
    // Non-PDF path: text extraction → chunking → Q&A (기존 로직)
    // ================================================================
    let text: string;
    try {
      text = await extractTextFromBuffer(file.buffer, file.mimeType);
    } catch (err) {
      yield { type: "error", data: { fileName: file.name, stage: "text_extraction", message: String(err) } };
      continue;
    }

    yield { type: "text_extracted", data: { fileName: file.name, textLength: text.length } };

    let imageFileUrl: string | undefined;
    if (IMAGE_MIME_TYPES.has(file.mimeType)) {
      if (config.r2Config) {
        try {
          const fileSlug = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_").replace(/\.[^.]+$/, "");
          const batchId = randomUUID().slice(0, 8);
          const ext = file.mimeType.split("/")[1] || "png";
          const r2Key = `ingest/${fileSlug}-${batchId}/original.${ext}`;
          imageFileUrl = await uploadImageToR2(file.buffer, r2Key, file.mimeType, config.r2Config);
        } catch (err) {
          yield { type: "error", data: { fileName: file.name, stage: "r2_upload", message: String(err) } };
        }
      }
      if (!imageFileUrl) {
        imageFileUrl = "local://image/original";
      }
    }

    const chunks = chunkText(text);
    yield { type: "chunks_created", data: { fileName: file.name, chunkCount: chunks.length } };

    for (const chunk of chunks) {
      yield {
        type: "qa_generating",
        data: { fileName: file.name, chunkIndex: chunk.index, totalChunks: chunks.length },
      };

      let qaPairs: Array<{ question: string; answer: string; category: string; pageNumber?: number }>;
      try {
        qaPairs = await generateQAPairs(chunk.text, { startPage: chunk.startPage });
      } catch (err) {
        yield { type: "error", data: { fileName: file.name, stage: "qa_generation", chunkIndex: chunk.index, message: String(err) } };
        continue;
      }

      const candidates: QACandidate[] = qaPairs.map((qa) => ({
        id: randomUUID(),
        question: qa.question,
        answer: qa.answer,
        category: qa.category,
        imageUrl: imageFileUrl,
        chunkIndex: chunk.index,
        fileName: file.name,
        isDuplicate: false,
      }));

      // Dedup
      for await (const event of dedupCandidates(candidates, config, db, file.name)) {
        yield event;
      }

      yield {
        type: "qa_generated",
        data: { fileName: file.name, chunkIndex: chunk.index, candidates, count: candidates.length },
      };

      allCandidates.push(...candidates);
    }

    yield {
      type: "file_done",
      data: { fileName: file.name, candidateCount: allCandidates.length },
    };
  }

  yield {
    type: "complete",
    data: {
      totalCandidates: allCandidates.length,
      duplicates: allCandidates.filter((c) => c.isDuplicate).length,
      unique: allCandidates.filter((c) => !c.isDuplicate).length,
    },
  };

  return allCandidates;
}
