import { randomUUID } from "node:crypto";
import { searchKnowledgeBase } from "@kb-chatbot/kb-engine";
import type { Database } from "@kb-chatbot/database";
import { chunkText } from "../processors/chunker.js";
import { generateQAPairs, analyzeImage } from "../ai/claude.js";
import { embedText } from "../ai/openai.js";
import { renderPdfPages } from "../processors/pdf-pages.js";
import type { R2Config } from "../storage/r2.js";

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
// Text extraction from buffer (no filesystem access)
// ---------------------------------------------------------------------------

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf") {
    // Use pdfjs-dist to extract text with \f page boundaries
    // (pdf-parse does not insert form feeds reliably)
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

  // Default: treat as UTF-8 text
  return buffer.toString("utf-8");
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
    const fileStartIdx = allCandidates.length;

    // --- file_start ---
    yield {
      type: "file_start",
      data: { fileName: file.name, mimeType: file.mimeType },
    };

    // --- extract text ---
    let text: string;
    try {
      text = await extractTextFromBuffer(file.buffer, file.mimeType);
    } catch (err) {
      yield {
        type: "error",
        data: {
          fileName: file.name,
          stage: "text_extraction",
          message: String(err),
        },
      };
      continue;
    }

    yield {
      type: "text_extracted",
      data: { fileName: file.name, textLength: text.length },
    };

    // --- Render PDF pages to images (local only, R2 upload deferred to approve) ---
    let pageBuffers: Map<number, Buffer> | undefined;

    if (file.mimeType === "application/pdf") {
      try {
        const pages = await renderPdfPages(file.buffer);
        pageBuffers = new Map();

        for (const page of pages) {
          pageBuffers.set(page.pageNum, page.image);
        }

        yield {
          type: "pages_rendered",
          data: {
            fileName: file.name,
            pageCount: pages.length,
            pageBuffers: Object.fromEntries(pageBuffers),
          },
        };
      } catch (err) {
        // PDF page rendering failed — continue without images
        yield {
          type: "error",
          data: {
            fileName: file.name,
            stage: "page_rendering",
            message: String(err),
          },
        };
      }
    }

    // --- Keep original image buffer for local serving ---
    let imageFileBuffer: Buffer | undefined;

    if (IMAGE_MIME_TYPES.has(file.mimeType)) {
      imageFileBuffer = file.buffer;
    }

    // --- chunk ---
    const chunks = chunkText(text);
    yield {
      type: "chunks_created",
      data: { fileName: file.name, chunkCount: chunks.length },
    };

    // --- process each chunk ---
    for (const chunk of chunks) {
      yield {
        type: "qa_generating",
        data: { fileName: file.name, chunkIndex: chunk.index, totalChunks: chunks.length },
      };

      let qaPairs: Array<{ question: string; answer: string; category: string; pageNumber?: number }>;
      try {
        qaPairs = await generateQAPairs(chunk.text, { startPage: chunk.startPage });
      } catch (err) {
        yield {
          type: "error",
          data: {
            fileName: file.name,
            stage: "qa_generation",
            chunkIndex: chunk.index,
            message: String(err),
          },
        };
        continue;
      }

      // --- deduplicate each Q&A ---
      const candidates: QACandidate[] = [];

      for (const qa of qaPairs) {
        // Resolve page number: Claude's response > chunk's startPage > first page
        const resolvedPage = qa.pageNumber ?? chunk.startPage ?? 1;

        const candidate: QACandidate = {
          id: randomUUID(),
          question: qa.question,
          answer: qa.answer,
          category: qa.category,
          imageUrl:
            // Always use local reference — R2 upload happens at approve time
            (imageFileBuffer ? "local://image/original" : undefined) ??
            (pageBuffers?.has(resolvedPage)
              ? `local://page/${resolvedPage}`
              : pageBuffers?.size
                ? `local://page/${pageBuffers.keys().next().value}`
                : undefined),
          chunkIndex: chunk.index,
          fileName: file.name,
          isDuplicate: false,
        };

        try {
          const embedding = await embedText(qa.question, config.openaiApiKey);
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
          // If dedup check fails, keep the candidate as non-duplicate
          // and let the user decide
          yield {
            type: "error",
            data: {
              fileName: file.name,
              stage: "dedup_check",
              chunkIndex: chunk.index,
              question: qa.question.slice(0, 60),
              message: String(err),
            },
          };
        }

        candidates.push(candidate);
      }

      yield {
        type: "qa_generated",
        data: {
          fileName: file.name,
          chunkIndex: chunk.index,
          candidates,
          count: candidates.length,
        },
      };

      allCandidates.push(...candidates);
    }

    // --- file_done ---
    yield {
      type: "file_done",
      data: {
        fileName: file.name,
        candidateCount: allCandidates.length - fileStartIdx,
      },
    };
  }

  // --- complete ---
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
