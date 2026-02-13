import chalk from "chalk";
import { listKBItems } from "@kb-chatbot/kb-engine";
import type { KBStatus } from "@kb-chatbot/shared";
import { getDb } from "../db.js";

export async function listCommand(options: {
  status?: string;
  search?: string;
  page?: string;
}) {
  const db = getDb();
  const result = await listKBItems(db, {
    status: (options.status as KBStatus) || undefined,
    search: options.search || undefined,
    page: Number(options.page) || 1,
    limit: 20,
  });

  console.log(chalk.bold(`\nKB 목록 (${result.total}건, ${result.page}/${result.totalPages} 페이지)\n`));

  for (const item of result.data) {
    const statusColor =
      item.status === "published" ? chalk.green : item.status === "draft" ? chalk.yellow : chalk.gray;
    const img = item.imageUrl ? chalk.cyan(" [IMG]") : "";
    console.log(
      `  ${chalk.dim(item.id.slice(0, 8))} ${statusColor(`[${item.status}]`)}${img} ${item.question}`,
    );
    console.log(chalk.dim(`    → ${item.answer.slice(0, 80)}${item.answer.length > 80 ? "..." : ""}`));
    console.log();
  }
}
