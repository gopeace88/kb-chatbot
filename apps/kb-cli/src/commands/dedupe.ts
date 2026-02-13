import chalk from "chalk";
import { sql } from "drizzle-orm";
import { knowledgeItems } from "@kb-chatbot/database";
import { updateKBItem, archiveKBItem } from "@kb-chatbot/kb-engine";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { suggestMerge } from "../ai/claude.js";
import { confirm, OPENAI_DIRECT_URL } from "../utils.js";

export async function dedupeCommand(options: {
  threshold?: string;
  auto?: boolean;
}) {
  const config = getConfig();
  const db = getDb();
  const threshold = Number(options.threshold) || 0.9;

  console.log(chalk.bold(`\n중복 검출 (threshold: ${threshold})\n`));

  const items = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      answer: knowledgeItems.answer,
      category: knowledgeItems.category,
    })
    .from(knowledgeItems)
    .where(sql`status = 'published' AND question_embedding IS NOT NULL`);

  console.log(chalk.dim(`${items.length}개 항목 로드\n`));

  if (items.length < 2) {
    console.log(chalk.green("비교할 항목이 부족합니다.\n"));
    return;
  }

  const pairs: Array<{ i: typeof items[0]; j: typeof items[0]; sim: number }> = [];

  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const result = await db.execute(
        sql`SELECT 1 - (
          (SELECT question_embedding FROM knowledge_items WHERE id = ${items[a].id})
          <=>
          (SELECT question_embedding FROM knowledge_items WHERE id = ${items[b].id})
        ) as sim`,
      );
      const row = result.rows?.[0] as Record<string, unknown> | undefined;
      const sim = Number(row?.sim ?? 0);
      if (sim >= threshold) {
        pairs.push({ i: items[a], j: items[b], sim });
      }
    }
  }

  if (pairs.length === 0) {
    console.log(chalk.green("중복 없음!\n"));
    return;
  }

  console.log(chalk.yellow(`${pairs.length}개 중복 쌍 발견\n`));

  let merged = 0;
  for (const pair of pairs) {
    console.log(chalk.cyan(`유사도: ${(pair.sim * 100).toFixed(1)}%`));
    console.log(`  1: ${pair.i.question}`);
    console.log(`  2: ${pair.j.question}\n`);

    const suggestion = await suggestMerge(
      { question: pair.i.question, answer: pair.i.answer },
      { question: pair.j.question, answer: pair.j.answer },
    );

    console.log(chalk.green(`  병합 제안:`));
    console.log(`    Q: ${suggestion.question}`);
    console.log(`    A: ${suggestion.answer.slice(0, 100)}...`);
    console.log(chalk.dim(`    이유: ${suggestion.explanation}\n`));

    let shouldApply = options.auto ?? false;
    if (!shouldApply) {
      shouldApply = await confirm("  병합할까요? (y/n): ");
    }

    if (shouldApply) {
      await updateKBItem(
        db,
        pair.i.id,
        { question: suggestion.question, answer: suggestion.answer },
        config.openaiApiKey,
        { baseUrl: OPENAI_DIRECT_URL },
      );
      await archiveKBItem(db, pair.j.id);
      merged++;
      console.log(chalk.green("  병합 완료\n"));
    }
  }

  console.log(chalk.bold(`\n완료: ${merged}건 병합\n`));
}

