import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv } from "../lib/env.js";

const variantLearning = new Hono<AppEnv>();

async function executeRows<T>(db: unknown, query: unknown): Promise<T[]> {
  const rows = await (db as { execute: (query: unknown) => Promise<Iterable<T>> })
    .execute(query);
  return Array.from(rows);
}

variantLearning.get("/logs", async (c) => {
  const db = c.get("db");
  const page = Math.max(Number(c.req.query("page") || "1"), 1);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || "30"), 1), 100);
  const offset = (page - 1) * limit;
  const decision = c.req.query("decision");

  const whereDecision = decision && decision !== "all"
    ? sql`WHERE l.decision = ${decision}`
    : sql``;

  const data = await executeRows(db, sql`
    SELECT
      l.id,
      l.user_message AS "userMessage",
      l.knowledge_item_id AS "knowledgeItemId",
      l.knowledge_question_variant_id AS "knowledgeQuestionVariantId",
      l.decision,
      l.suggested_question AS "suggestedQuestion",
      l.reason,
      l.similarity,
      l.source_count AS "sourceCount",
      l.last_asked_at AS "lastAskedAt",
      l.created_at AS "createdAt",
      k.question AS "kbQuestion",
      v.question AS "variantQuestion"
    FROM variant_learning_logs l
    LEFT JOIN knowledge_items k ON k.id = l.knowledge_item_id
    LEFT JOIN knowledge_question_variants v ON v.id = l.knowledge_question_variant_id
    ${whereDecision}
    ORDER BY l.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const countRows = await executeRows<{ total: number }>(db, sql`
    SELECT COUNT(*)::int AS total
    FROM variant_learning_logs l
    ${whereDecision}
  `);
  const total = countRows[0]?.total ?? 0;

  return c.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

variantLearning.delete("/logs/:id", async (c) => {
  const db = c.get("db");
  const rows = await executeRows<{ id: string }>(db, sql`
    DELETE FROM variant_learning_logs
    WHERE id = ${c.req.param("id")}
    RETURNING id
  `);
  if (rows.length === 0) return c.json({ error: "Log not found" }, 404);
  return c.json({ success: true });
});

variantLearning.delete("/logs/:id/variant", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const rows = await executeRows<{ variantId: string | null }>(db, sql`
    SELECT knowledge_question_variant_id AS "variantId"
    FROM variant_learning_logs
    WHERE id = ${id}
    LIMIT 1
  `);

  const variantId = rows[0]?.variantId;
  if (!variantId) return c.json({ error: "Linked variant not found" }, 404);

  await db.execute(sql`
    DELETE FROM knowledge_question_variants
    WHERE id = ${variantId}
  `);
  await db.execute(sql`
    UPDATE variant_learning_logs
    SET
      decision = 'removed',
      knowledge_question_variant_id = NULL,
      reason = COALESCE(reason || E'\n', '') || '운영자가 대시보드에서 유사질문을 삭제함'
    WHERE id = ${id}
  `);

  return c.json({ success: true });
});

export { variantLearning };
