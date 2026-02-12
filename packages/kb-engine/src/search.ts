import { sql } from "drizzle-orm";
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

  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const results = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      answer: knowledgeItems.answer,
      category: knowledgeItems.category,
      similarity: sql<number>`1 - (${knowledgeItems.questionEmbedding} <=> ${embeddingStr}::vector)`,
    })
    .from(knowledgeItems)
    .where(
      sql`${knowledgeItems.status} = 'published' AND 1 - (${knowledgeItems.questionEmbedding} <=> ${embeddingStr}::vector) >= ${threshold}`,
    )
    .orderBy(
      sql`${knowledgeItems.questionEmbedding} <=> ${embeddingStr}::vector`,
    )
    .limit(maxResults);

  return results;
}
