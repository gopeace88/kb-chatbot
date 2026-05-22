import chalk from "chalk";
import { sql } from "drizzle-orm";
import type { Database } from "@kb-chatbot/database";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import {
  embedTexts,
  generateQuestionVariants,
} from "../ai/openai.js";

interface VariantTarget {
  id: string;
  question: string;
  answer: string;
}

async function executeRows<T>(db: Database, query: unknown): Promise<T[]> {
  const rows = await (db as { execute: (query: unknown) => Promise<Iterable<T>> })
    .execute(query);
  return Array.from(rows);
}

export async function variantsCommand(options: {
  all?: boolean;
  id?: string;
  limit?: string;
  count?: string;
  dryRun?: boolean;
}) {
  const config = getConfig();
  const db = getDb();
  const limit = Number.parseInt(options.limit ?? "200", 10);
  const variantCount = Number.parseInt(options.count ?? "8", 10);

  const items = await executeRows<VariantTarget>(
    db,
    options.id
      ? sql`
          SELECT id, question, answer
          FROM knowledge_items
          WHERE status = 'published' AND id = ${options.id}
          LIMIT 1
        `
      : sql`
          SELECT id, question, answer
          FROM knowledge_items
          WHERE status = 'published'
          ORDER BY updated_at DESC
          LIMIT ${limit}
        `,
  );

  if (items.length === 0) {
    console.log(chalk.yellow("유사질문을 생성할 published KB가 없습니다."));
    return;
  }

  console.log(chalk.bold(`\n${items.length}개 KB 유사질문 생성 시작\n`));

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const [{ existing }] = await executeRows<{ existing: number }>(db, sql`
      SELECT COUNT(*)::int AS existing
      FROM knowledge_question_variants
      WHERE knowledge_item_id = ${item.id}
    `);

    if (!options.all && existing > 0) {
      skipped++;
      console.log(chalk.dim(`건너뜀: ${item.question} (${existing}개 이미 있음)`));
      continue;
    }

    console.log(chalk.cyan(`Q: ${item.question}`));
    const variants = await generateQuestionVariants(
      item.question,
      item.answer,
      config.openaiApiKey,
      variantCount,
    );

    const uniqueVariants = Array.from(new Set(variants));
    if (uniqueVariants.length === 0) {
      console.log(chalk.yellow("  생성된 유사질문 없음\n"));
      continue;
    }

    for (const variant of uniqueVariants) {
      console.log(chalk.dim(`  - ${variant}`));
    }

    if (options.dryRun) {
      console.log(chalk.dim("  dry-run: 저장하지 않음\n"));
      continue;
    }

    if (options.all && existing > 0) {
      await executeRows(db, sql`
        DELETE FROM knowledge_question_variants
        WHERE knowledge_item_id = ${item.id}
      `);
    }

    const embeddings = await embedTexts(uniqueVariants, config.openaiApiKey);
    const values = uniqueVariants.map((question, index) => {
      const embedding = `[${embeddings[index].join(",")}]`;
      return sql`(${item.id}, ${question}, ${embedding}::vector, 'ai_generated')`;
    });

    await executeRows(db, sql`
      INSERT INTO knowledge_question_variants (
        knowledge_item_id,
        question,
        question_embedding,
        source
      )
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (knowledge_item_id, question) DO NOTHING
    `);

    inserted += uniqueVariants.length;
    console.log(chalk.green(`  저장 완료: ${uniqueVariants.length}개\n`));
  }

  const itemIds = items.map((item) => item.id);
  const itemIdList = sql.join(itemIds.map((id) => sql`${id}`), sql`, `);
  const [{ totalVariants }] = itemIds.length > 0
    ? await executeRows<{ totalVariants: number }>(db, sql`
        SELECT COUNT(*)::int AS "totalVariants"
        FROM knowledge_question_variants
        WHERE knowledge_item_id IN (${itemIdList})
      `)
    : [{ totalVariants: 0 }];

  console.log(chalk.bold(`완료: 신규 ${inserted}개, 건너뜀 ${skipped}개, 대상 KB 총 유사질문 ${totalVariants}개\n`));
  process.exit(0);
}
