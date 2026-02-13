import chalk from "chalk";
import { listKBItems, updateKBItem } from "@kb-chatbot/kb-engine";
import type { KBStatus } from "@kb-chatbot/shared";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { improveAnswer } from "../ai/claude.js";
import { confirm, OPENAI_DIRECT_URL } from "../utils.js";

export async function improveCommand(options: {
  all?: boolean;
  category?: string;
  id?: string;
  auto?: boolean;
}) {
  const config = getConfig();
  const db = getDb();

  const result = await listKBItems(db, {
    status: "published" as KBStatus,
    category: options.category || undefined,
    limit: 100,
  });

  let items = result.data;
  if (options.id) {
    items = items.filter((i) => i.id === options.id);
  }

  if (items.length === 0) {
    console.log(chalk.yellow("개선할 KB 항목이 없습니다."));
    return;
  }

  console.log(chalk.bold(`\n${items.length}개 항목 개선 시작\n`));
  let improved = 0;

  for (const item of items) {
    const context = result.data
      .filter((i) => i.id !== item.id && i.category === item.category)
      .slice(0, 5);

    console.log(chalk.cyan(`Q: ${item.question}`));

    const suggestion = await improveAnswer(
      item.question,
      item.answer,
      context.map((c) => ({ question: c.question, answer: c.answer })),
      config.anthropicApiKey,
    );

    if (suggestion.answer === item.answer) {
      console.log(chalk.dim("  변경 없음\n"));
      continue;
    }

    console.log(chalk.red(`  - ${item.answer.slice(0, 100)}`));
    console.log(chalk.green(`  + ${suggestion.answer.slice(0, 100)}`));
    console.log(chalk.dim(`  이유: ${suggestion.explanation}\n`));

    let shouldApply = options.auto ?? false;
    if (!shouldApply) {
      shouldApply = await confirm("  적용할까요? (y/n): ");
    }

    if (shouldApply) {
      await updateKBItem(db, item.id, { answer: suggestion.answer }, config.openaiApiKey, {
        baseUrl: OPENAI_DIRECT_URL,
      });
      improved++;
      console.log(chalk.green("  적용 완료\n"));
    } else {
      console.log(chalk.dim("  건너뜀\n"));
    }
  }

  console.log(chalk.bold(`\n완료: ${improved}건 개선\n`));
}

