import { sql } from "drizzle-orm";
import {
  knowledgeItems,
  knowledgeQuestionVariants,
  type Database,
} from "@kb-chatbot/database";
import { VECTOR_SEARCH } from "@kb-chatbot/shared";

export interface SearchResult {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  imageUrl: string | null;
  similarity: number;
}

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

async function executeRows<T>(db: Database, query: unknown): Promise<T[]> {
  const rows = await (db as { execute: (query: unknown) => Promise<Iterable<T>> })
    .execute(query);
  return Array.from(rows);
}

/**
 * 등록된 원질문/유사질문과 문장이 정확히 같으면 임베딩 호출 없이 바로 매칭한다.
 */
export async function findDirectQuestionMatch(
  db: Database,
  question: string,
): Promise<SearchResult | null> {
  const normalized = normalizeQuestion(question);
  if (!normalized) return null;

  const rows = await executeRows<SearchResult>(db, sql`
    SELECT
      id,
      question,
      answer,
      category,
      image_url AS "imageUrl",
      1::double precision AS similarity
    FROM (
      SELECT
        k.id,
        k.question,
        k.answer,
        k.category,
        k.image_url,
        0 AS priority
      FROM knowledge_items k
      WHERE k.status = 'published'
        AND lower(regexp_replace(trim(k.question), '\\s+', ' ', 'g')) = ${normalized}

      UNION ALL

      SELECT
        k.id,
        k.question,
        k.answer,
        k.category,
        k.image_url,
        1 AS priority
      FROM knowledge_question_variants v
      INNER JOIN knowledge_items k ON v.knowledge_item_id = k.id
      WHERE k.status = 'published'
        AND lower(regexp_replace(trim(v.question), '\\s+', ' ', 'g')) = ${normalized}
    ) matches
    ORDER BY priority ASC
    LIMIT 1
  `);

  return rows[0] ?? null;
}

/**
 * 벡터 유사도 검색으로 지식 베이스에서 매칭되는 Q&A 검색
 *
 * pgvector <=> 연산자: cosine distance (0 = 동일, 2 = 정반대)
 * similarity = 1 - distance: 1 = 동일, -1 = 정반대
 */
export async function searchKnowledgeBase(
  db: Database,
  queryEmbedding: number[],
  options?: {
    threshold?: number;
    maxResults?: number;
  },
): Promise<SearchResult[]> {
  const threshold = options?.threshold ?? VECTOR_SEARCH.CONTEXT_THRESHOLD;
  const maxResults = options?.maxResults ?? VECTOR_SEARCH.MAX_RESULTS;

  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(sql<SearchResult>`
    SELECT
      id,
      question,
      answer,
      category,
      image_url AS "imageUrl",
      similarity
    FROM (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY similarity DESC) AS rank
      FROM (
        SELECT
          ${knowledgeItems.id} AS id,
          ${knowledgeItems.question} AS question,
          ${knowledgeItems.answer} AS answer,
          ${knowledgeItems.category} AS category,
          ${knowledgeItems.imageUrl} AS image_url,
          1 - (${knowledgeItems.questionEmbedding} <=> ${embeddingStr}::vector) AS similarity
        FROM ${knowledgeItems}
        WHERE
          ${knowledgeItems.status} = 'published'
          AND ${knowledgeItems.questionEmbedding} IS NOT NULL
          AND 1 - (${knowledgeItems.questionEmbedding} <=> ${embeddingStr}::vector) > ${threshold}

        UNION ALL

        SELECT
          ${knowledgeItems.id} AS id,
          ${knowledgeItems.question} AS question,
          ${knowledgeItems.answer} AS answer,
          ${knowledgeItems.category} AS category,
          ${knowledgeItems.imageUrl} AS image_url,
          1 - (${knowledgeQuestionVariants.questionEmbedding} <=> ${embeddingStr}::vector) AS similarity
        FROM ${knowledgeQuestionVariants}
        INNER JOIN ${knowledgeItems}
          ON ${knowledgeQuestionVariants.knowledgeItemId} = ${knowledgeItems.id}
        WHERE
          ${knowledgeItems.status} = 'published'
          AND 1 - (${knowledgeQuestionVariants.questionEmbedding} <=> ${embeddingStr}::vector) > ${threshold}
      ) all_matches
    ) ranked
    WHERE rank = 1
    ORDER BY similarity DESC
    LIMIT ${maxResults}
  `);

  return Array.from(results);
}
