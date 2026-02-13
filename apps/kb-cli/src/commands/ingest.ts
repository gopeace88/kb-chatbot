import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import chalk from "chalk";
import { createKBItem, searchKnowledgeBase } from "@kb-chatbot/kb-engine";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { extractTextFromPDF } from "../processors/pdf.js";
import { extractTextFromImage, isImageFile } from "../processors/image.js";
import { chunkText } from "../processors/chunker.js";
import { generateQAPairs } from "../ai/claude.js";
import { embedText } from "../ai/openai.js";
import { confirm, OPENAI_DIRECT_URL } from "../utils.js";

const DEDUP_THRESHOLD = 0.85;

export async function ingestCommand(
  filePath: string,
  options: { auto?: boolean },
) {
  const config = getConfig();
  const db = getDb();

  const files = await resolveFiles(filePath);
  console.log(chalk.bold(`\n${files.length}개 파일 처리 시작\n`));

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const file of files) {
    console.log(chalk.cyan(`처리 중: ${file}`));

    let text: string;
    try {
      text = await extractFromFile(file, config.anthropicApiKey);
    } catch (err) {
      console.log(chalk.red(`  텍스트 추출 실패: ${err}`));
      continue;
    }
    console.log(chalk.dim(`  텍스트 추출 완료 (${text.length}자)`));

    const chunks = chunkText(text);
    console.log(chalk.dim(`  ${chunks.length}개 청크로 분할`));

    for (const chunk of chunks) {
      let qaPairs: Array<{ question: string; answer: string; category: string }>;
      try {
        qaPairs = await generateQAPairs(chunk.text, config.anthropicApiKey);
      } catch (err) {
        console.log(chalk.red(`  Q&A 생성 실패 (청크 ${chunk.index}): ${err}`));
        continue;
      }

      for (const qa of qaPairs) {
        const embedding = await embedText(qa.question, config.openaiApiKey);
        const existing = await searchKnowledgeBase(db, embedding, {
          threshold: DEDUP_THRESHOLD,
          maxResults: 1,
        });

        if (existing.length > 0) {
          console.log(
            chalk.yellow(`  [중복 스킵] "${qa.question.slice(0, 40)}..." ↔ "${existing[0].question.slice(0, 40)}..." (${(existing[0].similarity * 100).toFixed(1)}%)`),
          );
          totalSkipped++;
          continue;
        }

        if (!options.auto) {
          console.log(chalk.white(`\n  새 Q&A:`));
          console.log(chalk.white(`    Q: ${qa.question}`));
          console.log(chalk.white(`    A: ${qa.answer}`));
          console.log(chalk.dim(`    카테고리: ${qa.category}`));
          const confirmed = await confirm("  저장할까요? (y/n): ");
          if (!confirmed) {
            totalSkipped++;
            continue;
          }
        }

        await createKBItem(
          db,
          {
            question: qa.question,
            answer: qa.answer,
            category: qa.category,
            createdBy: "kb-cli/ingest",
          },
          config.openaiApiKey,
          { baseUrl: OPENAI_DIRECT_URL },
        );
        totalCreated++;
        console.log(chalk.green(`  [저장] ${qa.question.slice(0, 50)}`));
      }
    }
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

async function extractFromFile(file: string, anthropicApiKey: string): Promise<string> {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return extractTextFromPDF(file);
  if (isImageFile(file)) return extractTextFromImage(file, anthropicApiKey);
  return (await readFile(file, "utf-8")).toString();
}

