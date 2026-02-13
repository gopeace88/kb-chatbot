import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import chalk from "chalk";
import { createKBItem } from "@kb-chatbot/kb-engine";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { confirm, OPENAI_DIRECT_URL } from "../utils.js";
import {
  runIngestPipeline,
  type IngestEvent,
  type QACandidate,
  type IngestFileInput,
} from "../core/ingest-pipeline.js";
import { getR2Config, type R2Config } from "../storage/r2.js";

// Mime-type mapping for local files
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

function guessMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "text/plain";
}

export async function ingestCommand(
  filePath: string,
  options: { auto?: boolean },
) {
  const config = getConfig();
  const db = getDb();

  let r2Config: R2Config | undefined;
  try {
    r2Config = getR2Config();
  } catch {
    // R2 not configured — proceed without images
  }

  // Resolve paths and read files into buffers
  const filePaths = await resolveFiles(filePath);
  console.log(chalk.bold(`\n${filePaths.length}개 파일 처리 시작\n`));

  const files: IngestFileInput[] = [];
  for (const fp of filePaths) {
    const buffer = await readFile(fp);
    files.push({
      name: basename(fp),
      buffer: Buffer.from(buffer),
      mimeType: guessMimeType(fp),
    });
  }

  // Run the core pipeline
  const pipeline = runIngestPipeline(files, { openaiApiKey: config.openaiApiKey, r2Config }, db);

  let totalCreated = 0;
  let totalSkipped = 0;

  // Consume events from the generator
  let result = await pipeline.next();
  while (!result.done) {
    const event = result.value as IngestEvent;

    switch (event.type) {
      case "file_start":
        console.log(chalk.cyan(`처리 중: ${event.data.fileName}`));
        break;

      case "text_extracted":
        console.log(chalk.dim(`  텍스트 추출 완료 (${event.data.textLength}자)`));
        break;

      case "chunks_created":
        console.log(chalk.dim(`  ${event.data.chunkCount}개 청크로 분할`));
        break;

      case "pages_rendered":
        console.log(
          chalk.dim(
            `  ${event.data.pageCount}페이지 이미지 렌더링 + R2 업로드 완료`,
          ),
        );
        break;

      case "qa_generating":
        // Silent — could add a spinner here later
        break;

      case "qa_generated": {
        const candidates = event.data.candidates as QACandidate[];
        for (const candidate of candidates) {
          if (candidate.isDuplicate) {
            console.log(
              chalk.yellow(
                `  [중복 스킵] "${candidate.question.slice(0, 40)}..." ↔ "${candidate.duplicateOf!.question.slice(0, 40)}..." (${(candidate.duplicateOf!.similarity * 100).toFixed(1)}%)`,
              ),
            );
            totalSkipped++;
            continue;
          }

          if (!options.auto) {
            // Interactive mode: prompt for each candidate
            console.log(chalk.white(`\n  새 Q&A:`));
            console.log(chalk.white(`    Q: ${candidate.question}`));
            console.log(chalk.white(`    A: ${candidate.answer}`));
            console.log(chalk.dim(`    카테고리: ${candidate.category}`));
            if (candidate.imageUrl) {
              console.log(chalk.dim(`    이미지: ${candidate.imageUrl}`));
            }
            const confirmed = await confirm("  저장할까요? (y/n): ");
            if (!confirmed) {
              totalSkipped++;
              continue;
            }
          }

          // Save to DB
          await createKBItem(
            db,
            {
              question: candidate.question,
              answer: candidate.answer,
              category: candidate.category,
              imageUrl: candidate.imageUrl,
              createdBy: "kb-cli/ingest",
            },
            config.openaiApiKey,
            { baseUrl: OPENAI_DIRECT_URL },
          );
          totalCreated++;
          console.log(chalk.green(`  [저장] ${candidate.question.slice(0, 50)}`));
        }
        break;
      }

      case "error":
        if (event.data.stage === "text_extraction") {
          console.log(chalk.red(`  텍스트 추출 실패: ${event.data.message}`));
        } else if (event.data.stage === "qa_generation") {
          console.log(chalk.red(`  Q&A 생성 실패 (청크 ${event.data.chunkIndex}): ${event.data.message}`));
        } else if (event.data.stage === "dedup_check") {
          console.log(chalk.red(`  중복 검사 실패 (${event.data.question}): ${event.data.message}`));
        } else if (event.data.stage === "page_rendering") {
          console.log(chalk.yellow(`  페이지 이미지 렌더링 실패: ${event.data.message}`));
        }
        break;

      case "file_done":
      case "complete":
        // Handled after the loop
        break;
    }

    result = await pipeline.next();
  }

  console.log(chalk.bold(`\n완료: ${totalCreated}건 생성, ${totalSkipped}건 스킵\n`));
}

async function resolveFiles(path: string): Promise<string[]> {
  const s = await stat(path);
  if (s.isFile()) return [path];
  if (s.isDirectory()) {
    const entries = await readdir(path);
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(path, entry);
      const es = await stat(full);
      if (es.isFile()) files.push(full);
    }
    return files;
  }
  return [];
}
