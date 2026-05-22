import chalk from "chalk";
import { sql } from "drizzle-orm";
import type { Database } from "@kb-chatbot/database";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import {
  decideLearnedVariant,
  embedText,
} from "../ai/openai.js";

interface ConversationCandidate {
  userMessage: string;
  count: number;
  lastAsked: Date;
}

interface KBMatch {
  id: string;
  question: string;
  answer: string;
  similarity: number;
}

interface DirectQuestionMatch {
  id: string;
  question: string;
}

async function executeRows<T>(db: Database, query: unknown): Promise<T[]> {
  const rows = await (db as { execute: (query: unknown) => Promise<Iterable<T>> })
    .execute(query);
  return Array.from(rows);
}

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCommonAliases(question: string): string {
  return normalizeQuestion(question)
    .replace(/화치/g, "워치")
    .replace(/와치/g, "워치")
    .replace(/기종/g, "모델")
    .replace(/리스트/g, "목록")
    .replace(/피닉스/g, "fenix")
    .replace(/훼닉스/g, "fenix")
    .replace(/포러너/g, "forerunner")
    .replace(/포erunner/g, "forerunner")
    .replace(/인스팅트/g, "instinct")
    .replace(/인스틴트/g, "instinct")
    .replace(/엣지/g, "edge")
    .replace(/런 비전/g, "런비전");
}

async function findDirectQuestion(
  db: Database,
  question: string,
): Promise<DirectQuestionMatch | null> {
  const normalized = normalizeQuestion(question);
  const rows = await executeRows<DirectQuestionMatch>(db, sql`
    SELECT id, question
    FROM (
      SELECT
        id,
        question,
        0 AS priority
      FROM knowledge_items
      WHERE status = 'published'
        AND lower(regexp_replace(trim(question), '\\s+', ' ', 'g')) = ${normalized}

      UNION ALL

      SELECT
        k.id,
        v.question,
        1 AS priority
      FROM knowledge_question_variants v
      JOIN knowledge_items k ON k.id = v.knowledge_item_id
      WHERE k.status = 'published'
        AND lower(regexp_replace(trim(v.question), '\\s+', ' ', 'g')) = ${normalized}
    ) matches
    ORDER BY priority ASC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function hasDirectQuestion(db: Database, question: string): Promise<boolean> {
  return (await findDirectQuestion(db, question)) !== null;
}

async function findBestKBMatch(
  db: Database,
  question: string,
  openaiApiKey: string,
): Promise<KBMatch | null> {
  const embedding = await embedText(question, openaiApiKey);
  const embeddingStr = `[${embedding.join(",")}]`;
  const rows = await executeRows<KBMatch>(db, sql`
    SELECT id, question, answer, similarity
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY similarity DESC) AS rank
      FROM (
        SELECT
          k.id,
          k.question,
          k.answer,
          1 - (k.question_embedding <=> ${embeddingStr}::vector) AS similarity
        FROM knowledge_items k
        WHERE k.status = 'published'
          AND k.question_embedding IS NOT NULL

        UNION ALL

        SELECT
          k.id,
          k.question,
          k.answer,
          1 - (v.question_embedding <=> ${embeddingStr}::vector) AS similarity
        FROM knowledge_question_variants v
        JOIN knowledge_items k ON k.id = v.knowledge_item_id
        WHERE k.status = 'published'
      ) matches
    ) ranked
    WHERE rank = 1
    ORDER BY similarity DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function addLearnedVariant(
  db: Database,
  knowledgeItemId: string,
  question: string,
  openaiApiKey: string,
): Promise<string | null> {
  const embedding = await embedText(question, openaiApiKey);
  const embeddingStr = `[${embedding.join(",")}]`;
  const rows = await executeRows<{ id: string }>(db, sql`
    INSERT INTO knowledge_question_variants (
      knowledge_item_id,
      question,
      question_embedding,
      source
    )
    VALUES (
      ${knowledgeItemId},
      ${question},
      ${embeddingStr}::vector,
      'learned_daily'
    )
    ON CONFLICT (knowledge_item_id, question) DO NOTHING
    RETURNING id
  `);
  return rows[0]?.id ?? null;
}

async function recordLearningLog(
  db: Database,
  entry: {
    userMessage: string;
    knowledgeItemId?: string | null;
    knowledgeQuestionVariantId?: string | null;
    decision: "inserted" | "rejected" | "skipped";
    suggestedQuestion?: string | null;
    reason?: string | null;
    similarity?: number | null;
    sourceCount: number;
    lastAskedAt: Date;
  },
) {
  await executeRows(db, sql`
    INSERT INTO variant_learning_logs (
      user_message,
      knowledge_item_id,
      knowledge_question_variant_id,
      decision,
      suggested_question,
      reason,
      similarity,
      source_count,
      last_asked_at
    )
    VALUES (
      ${entry.userMessage},
      ${entry.knowledgeItemId ?? null},
      ${entry.knowledgeQuestionVariantId ?? null},
      ${entry.decision},
      ${entry.suggestedQuestion ?? null},
      ${entry.reason ?? null},
      ${entry.similarity ?? null},
      ${entry.sourceCount},
      ${entry.lastAskedAt}
    )
  `);
}

async function getCandidates(
  db: Database,
  days: number,
  limit: number,
  maxSimilarity: number,
): Promise<ConversationCandidate[]> {
  return executeRows<ConversationCandidate>(db, sql`
    SELECT
      user_message AS "userMessage",
      COUNT(*)::int AS count,
      MAX(created_at) AS "lastAsked",
      MIN(
        CASE
          WHEN response_source = 'fallback'
            OR similarity_score IS NULL
            OR similarity_score < ${maxSimilarity}
          THEN 0
          ELSE 1
        END
      ) AS priority
    FROM conversations
    WHERE created_at >= NOW() - (${days}::text || ' days')::interval
      AND length(trim(user_message)) >= 2
    GROUP BY user_message
    ORDER BY priority ASC, MAX(created_at) DESC
    LIMIT ${limit}
  `);
}

export async function variantsLearnCommand(options: {
  days?: string;
  limit?: string;
  minSimilarity?: string;
  maxSimilarity?: string;
  apply?: boolean;
}) {
  const config = getConfig();
  const db = getDb();
  const days = Number.parseInt(options.days ?? "1", 10);
  const limit = Number.parseInt(options.limit ?? "50", 10);
  const minSimilarity = Number.parseFloat(options.minSimilarity ?? "0.45");
  const maxSimilarity = Number.parseFloat(options.maxSimilarity ?? "0.85");
  const apply = options.apply === true;

  console.log(chalk.bold(`최근 ${days}일 대화에서 유사질문 학습 후보를 분석합니다.`));
  console.log(apply ? chalk.yellow("DB 저장 모드(--apply)") : chalk.dim("dry-run: DB에 저장하지 않습니다."));

  const candidates = await getCandidates(db, days, limit, maxSimilarity);
  if (candidates.length === 0) {
    console.log(chalk.yellow("분석할 후보 질문이 없습니다."));
    return;
  }

  let accepted = 0;
  let inserted = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (await hasDirectQuestion(db, candidate.userMessage)) {
      skipped++;
      console.log(chalk.dim(`건너뜀(이미 등록): ${candidate.userMessage}`));
      if (apply) {
        await recordLearningLog(db, {
          userMessage: candidate.userMessage,
          decision: "skipped",
          reason: "이미 등록된 질문",
          sourceCount: candidate.count,
          lastAskedAt: candidate.lastAsked,
        });
      }
      continue;
    }

    const normalizedAlias = normalizeCommonAliases(candidate.userMessage);
    if (normalizedAlias !== normalizeQuestion(candidate.userMessage)) {
      const directAliasMatch = await findDirectQuestion(db, normalizedAlias);
      if (directAliasMatch) {
        accepted++;
        console.log(chalk.green(`승인(별칭 정규화): ${candidate.userMessage}`));
        console.log(chalk.dim(`  정규화: ${normalizedAlias}`));
        console.log(chalk.dim(`  KB: ${directAliasMatch.question}`));

        if (apply) {
          const insertedId = await addLearnedVariant(
            db,
            directAliasMatch.id,
            candidate.userMessage,
            config.openaiApiKey,
          );
          if (insertedId) inserted++;
          await recordLearningLog(db, {
            userMessage: candidate.userMessage,
            knowledgeItemId: directAliasMatch.id,
            knowledgeQuestionVariantId: insertedId,
            decision: insertedId ? "inserted" : "skipped",
            suggestedQuestion: candidate.userMessage,
            reason: insertedId
              ? `별칭 정규화로 '${normalizedAlias}'와 직접 매칭`
              : "중복으로 저장되지 않음",
            similarity: 1,
            sourceCount: candidate.count,
            lastAskedAt: candidate.lastAsked,
          });
          console.log(insertedId ? chalk.green("  저장 완료") : chalk.dim("  저장 생략: 중복"));
        }
        continue;
      }
    }

    const match = await findBestKBMatch(db, candidate.userMessage, config.openaiApiKey);
    if (!match || match.similarity < minSimilarity) {
      skipped++;
      console.log(chalk.dim(`건너뜀(낮은 유사도): ${candidate.userMessage}`));
      if (apply) {
        await recordLearningLog(db, {
          userMessage: candidate.userMessage,
          knowledgeItemId: match?.id ?? null,
          decision: "skipped",
          reason: match
            ? `유사도 ${match.similarity.toFixed(3)}가 기준 ${minSimilarity}보다 낮음`
            : "매칭되는 KB 없음",
          similarity: match?.similarity ?? null,
          sourceCount: candidate.count,
          lastAskedAt: candidate.lastAsked,
        });
      }
      continue;
    }

    const decision = await decideLearnedVariant(
      candidate.userMessage,
      match.question,
      match.answer,
      config.openaiApiKey,
    );

    if (!decision.accept || !decision.variant) {
      skipped++;
      console.log(chalk.gray(`거절: ${candidate.userMessage}`));
      console.log(chalk.gray(`  후보 KB: ${match.question} (${match.similarity.toFixed(3)})`));
      console.log(chalk.gray(`  이유: ${decision.reason || "-"}`));
      if (apply) {
        await recordLearningLog(db, {
          userMessage: candidate.userMessage,
          knowledgeItemId: match.id,
          decision: "rejected",
          suggestedQuestion: decision.variant ?? null,
          reason: decision.reason ?? null,
          similarity: match.similarity,
          sourceCount: candidate.count,
          lastAskedAt: candidate.lastAsked,
        });
      }
      continue;
    }

    accepted++;
    console.log(chalk.green(`승인: ${decision.variant}`));
    console.log(chalk.dim(`  원문: ${candidate.userMessage}`));
    console.log(chalk.dim(`  KB: ${match.question} (${match.similarity.toFixed(3)})`));
    console.log(chalk.dim(`  이유: ${decision.reason || "-"}`));

    if (apply) {
      if (await hasDirectQuestion(db, decision.variant)) {
        skipped++;
        console.log(chalk.dim("  저장 생략: 이미 등록된 질문"));
        await recordLearningLog(db, {
          userMessage: candidate.userMessage,
          knowledgeItemId: match.id,
          decision: "skipped",
          suggestedQuestion: decision.variant,
          reason: "생성된 유사질문이 이미 등록됨",
          similarity: match.similarity,
          sourceCount: candidate.count,
          lastAskedAt: candidate.lastAsked,
        });
        continue;
      }

      const insertedId = await addLearnedVariant(
        db,
        match.id,
        decision.variant,
        config.openaiApiKey,
      );
      const originalInsertedId = decision.variant === candidate.userMessage
        ? null
        : await addLearnedVariant(
          db,
          match.id,
          candidate.userMessage,
          config.openaiApiKey,
        );
      if (insertedId) inserted++;
      if (originalInsertedId) inserted++;
      await recordLearningLog(db, {
        userMessage: candidate.userMessage,
        knowledgeItemId: match.id,
        knowledgeQuestionVariantId: insertedId ?? originalInsertedId,
        decision: insertedId || originalInsertedId ? "inserted" : "skipped",
        suggestedQuestion: decision.variant,
        reason: insertedId || originalInsertedId
          ? `${decision.reason ?? ""}${originalInsertedId ? " / 고객 원문도 함께 저장" : ""}`.trim()
          : "중복으로 저장되지 않음",
        similarity: match.similarity,
        sourceCount: candidate.count,
        lastAskedAt: candidate.lastAsked,
      });
      console.log(
        insertedId || originalInsertedId
          ? chalk.green(`  저장 완료${originalInsertedId ? " (원문 포함)" : ""}`)
          : chalk.dim("  저장 생략: 중복"),
      );
    }
  }

  console.log(chalk.bold(`완료: 후보 ${candidates.length}개, 승인 ${accepted}개, 저장 ${inserted}개, 건너뜀 ${skipped}개`));
  process.exit(0);
}
