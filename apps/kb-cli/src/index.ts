import { Command } from "commander";
import { ingestCommand } from "./commands/ingest.js";
import { improveCommand } from "./commands/improve.js";
import { dedupeCommand } from "./commands/dedupe.js";
import { listCommand } from "./commands/list.js";
import { serveCommand } from "./commands/serve.js";

const program = new Command();

program
  .name("kb-cli")
  .description("KB Chatbot CLI — 지식 베이스 관리 도구")
  .version("0.0.1");

program
  .command("ingest <path>")
  .description("문서/이미지를 분석하여 Q&A를 자동 생성합니다")
  .option("--auto", "확인 없이 자동으로 모든 Q&A 저장")
  .action(ingestCommand);

program
  .command("improve")
  .description("기존 KB 답변을 AI로 개선합니다")
  .option("--all", "모든 published 항목 개선")
  .option("--category <category>", "특정 카테고리만 개선")
  .option("--id <uuid>", "특정 항목만 개선")
  .option("--auto", "확인 없이 자동 적용")
  .action(improveCommand);

program
  .command("dedupe")
  .description("중복 KB 항목을 검출하고 병합합니다")
  .option("--threshold <number>", "유사도 임계값 (기본: 0.9)")
  .option("--auto", "확인 없이 자동 병합")
  .action(dedupeCommand);

program
  .command("list")
  .description("KB 목록을 조회합니다")
  .option("--status <status>", "상태 필터 (draft/published/archived)")
  .option("--search <query>", "검색어")
  .option("--page <number>", "페이지")
  .action(listCommand);

program
  .command("serve")
  .description("대시보드 연동용 로컬 HTTP 서버를 시작합니다")
  .option("--port <number>", "포트 번호 (기본: 3457)")
  .action(serveCommand);

program.parse();
