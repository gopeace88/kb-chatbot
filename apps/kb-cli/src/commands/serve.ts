import { serve } from "@hono/node-server";
import chalk from "chalk";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { createApp } from "../server/index.js";
import { getR2Config, type R2Config } from "../storage/r2.js";

const DEFAULT_PORT = 3457;

export async function serveCommand(options: { port?: string }) {
  const port = options.port ? parseInt(options.port, 10) : DEFAULT_PORT;

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(chalk.red("Invalid port number"));
    process.exit(1);
  }

  const config = getConfig();
  const db = getDb();

  let r2Config: R2Config | undefined;
  try {
    r2Config = getR2Config();
  } catch {
    // R2 not configured — proceed without image upload
  }

  const app = createApp(db, config.openaiApiKey, port, r2Config);

  serve(
    { fetch: app.fetch, port },
    (info) => {
      console.log("");
      console.log(chalk.bold("  KB CLI Server"));
      console.log(chalk.gray("  ─────────────────────────────────────"));
      console.log(`  ${chalk.green(">")} Local:   ${chalk.cyan(`http://localhost:${info.port}`)}`);
      console.log(`  ${chalk.green(">")} Health:  ${chalk.cyan(`http://localhost:${info.port}/health`)}`);
      if (r2Config) {
        console.log(`  ${chalk.green(">")} R2:      ${chalk.green("연결됨")}`);
      } else {
        console.log(`  ${chalk.yellow(">")} R2:      ${chalk.yellow("미설정 (이미지 업로드 비활성화)")}`);
      }
      console.log(chalk.gray("  ─────────────────────────────────────"));
      console.log(`  ${chalk.gray("Press Ctrl+C to stop")}`);
      console.log("");
    },
  );
}
