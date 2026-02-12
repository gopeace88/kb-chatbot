import { sql, gt, eq, asc } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql/functions";
import { knowledgeItems, type Database } from "@kb-chatbot/database";
import { VECTOR_SEARCH } from "@kb-chatbot/shared";

export interface SearchResult {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  similarity: number;
}

/**
 * 벡터 유사도 검색으로 지식 베이스에서 매칭되는 Q&A 검색
 *
 * cosineDistance: 0 = 동일, 2 = 정반대
 * similarity = 1 - cosineDistance: 1 = 동일, -1 = 정반대
 */
export async function searchKnowledgeBase(
  db: Database,
  queryEmbedding: number[],
  options?: {
    threshold?: number;
    maxResults?: number;
  },
): Promise<SearchResult[]> {
  const threshold = options?.threshold ?? VECTOR_SEARCH.SIMILARITY_THRESHOLD;
  const maxResults = options?.maxResults ?? VECTOR_SEARCH.MAX_RESULTS;

  const distance = cosineDistance(
    knowledgeItems.questionEmbedding,
    queryEmbedding,
  );
  const similarity = sql<number>`1 - ${distance}`;

  const results = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      answer: knowledgeItems.answer,
      category: knowledgeItems.category,
      similarity,
    })
    .from(knowledgeItems)
    .where(
      sql`${eq(knowledgeItems.status, "published")} AND ${gt(similarity, threshold)}`,
    )
    .orderBy(asc(distance))
    .limit(maxResults);

  return results;
}
