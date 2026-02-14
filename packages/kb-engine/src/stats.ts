import { eq, sql, count, gte, and, avg, isNull, isNotNull } from "drizzle-orm";
import {
  knowledgeItems,
  rawInquiries,
  conversations,
  type Database,
} from "@kb-chatbot/database";

export interface DashboardStats {
  totalKB: number;
  publishedKB: number;
  todayInquiries: number;
  newInquiries: number;
  todayConversations: number;
  autoAnswerRate: number;
}

/**
 * 대시보드 요약 통계
 */
export async function getDashboardStats(db: Database): Promise<DashboardStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    [{ totalKB }],
    [{ publishedKB }],
    [{ todayInquiries }],
    [{ newInquiries }],
    [{ todayConversations }],
    [{ kbMatchCount }],
  ] = await Promise.all([
    db.select({ totalKB: count() }).from(knowledgeItems),
    db
      .select({ publishedKB: count() })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.status, "published")),
    db
      .select({ todayInquiries: count() })
      .from(rawInquiries)
      .where(gte(rawInquiries.createdAt, todayStart)),
    db
      .select({ newInquiries: count() })
      .from(rawInquiries)
      .where(eq(rawInquiries.status, "new")),
    db
      .select({ todayConversations: count() })
      .from(conversations)
      .where(gte(conversations.createdAt, todayStart)),
    db
      .select({ kbMatchCount: count() })
      .from(conversations)
      .where(
        and(
          gte(conversations.createdAt, todayStart),
          eq(conversations.responseSource, "kb_match"),
        ),
      ),
  ]);

  const autoAnswerRate =
    todayConversations > 0 ? kbMatchCount / todayConversations : 0;

  return {
    totalKB,
    publishedKB,
    todayInquiries,
    newInquiries,
    todayConversations,
    autoAnswerRate: Math.round(autoAnswerRate * 100) / 100,
  };
}

export interface ConversationStats {
  bySource: Array<{ source: string; count: number }>;
  byDate: Array<{ date: string; count: number }>;
}

/**
 * 대화 통계 (답변 소스별, 일별)
 */
export async function getConversationStats(
  db: Database,
  days: number = 7,
): Promise<ConversationStats> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [bySource, byDate] = await Promise.all([
    db
      .select({
        source: conversations.responseSource,
        count: count(),
      })
      .from(conversations)
      .where(gte(conversations.createdAt, since))
      .groupBy(conversations.responseSource),
    db
      .select({
        date: sql<string>`DATE(${conversations.createdAt})`,
        count: count(),
      })
      .from(conversations)
      .where(gte(conversations.createdAt, since))
      .groupBy(sql`DATE(${conversations.createdAt})`)
      .orderBy(sql`DATE(${conversations.createdAt})`),
  ]);

  return {
    bySource: bySource.map((r) => ({ source: r.source, count: r.count })),
    byDate: byDate.map((r) => ({ date: r.date, count: r.count })),
  };
}

export interface RAGStats {
  sourceDist: Array<{ source: string; count: number; pct: number }>;
  dailyConversations: Array<{ date: string; count: number }>;
  avgSimilarity: number;
  feedbackStats: { helpful: number; notHelpful: number; noFeedback: number };
  categoryUsage: Array<{ category: string; count: number }>;
}

/**
 * RAG 성능 종합 통계
 */
export async function getRAGStats(db: Database, days: number = 7): Promise<RAGStats> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [
    bySource,
    dailyConversations,
    [{ avgSim }],
    [{ helpful }],
    [{ notHelpful }],
    [{ noFeedback }],
    categoryUsage,
  ] = await Promise.all([
    // 응답 소스 분포
    db
      .select({
        source: conversations.responseSource,
        count: count(),
      })
      .from(conversations)
      .where(gte(conversations.createdAt, since))
      .groupBy(conversations.responseSource),
    // 일별 대화 추이
    db
      .select({
        date: sql<string>`DATE(${conversations.createdAt})`,
        count: count(),
      })
      .from(conversations)
      .where(gte(conversations.createdAt, since))
      .groupBy(sql`DATE(${conversations.createdAt})`)
      .orderBy(sql`DATE(${conversations.createdAt})`),
    // 평균 유사도 (kb_match만)
    db
      .select({
        avgSim: sql<number>`COALESCE(AVG(${conversations.similarityScore}), 0)`,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.responseSource, "kb_match"),
          gte(conversations.createdAt, since),
        ),
      ),
    // 피드백 통계
    db
      .select({ helpful: count() })
      .from(conversations)
      .where(and(eq(conversations.wasHelpful, true), gte(conversations.createdAt, since))),
    db
      .select({ notHelpful: count() })
      .from(conversations)
      .where(and(eq(conversations.wasHelpful, false), gte(conversations.createdAt, since))),
    db
      .select({ noFeedback: count() })
      .from(conversations)
      .where(and(isNull(conversations.wasHelpful), gte(conversations.createdAt, since))),
    // 카테고리별 KB 사용 빈도
    db
      .select({
        category: sql<string>`COALESCE(${knowledgeItems.category}, '미분류')`,
        count: count(),
      })
      .from(conversations)
      .innerJoin(
        knowledgeItems,
        sql`${conversations.matchedKbId} = ${knowledgeItems.id}`,
      )
      .where(
        and(
          isNotNull(conversations.matchedKbId),
          gte(conversations.createdAt, since),
        ),
      )
      .groupBy(knowledgeItems.category)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10),
  ]);

  const totalConv = bySource.reduce((sum, r) => sum + r.count, 0);
  const sourceDist = bySource.map((r) => ({
    source: r.source,
    count: r.count,
    pct: totalConv > 0 ? Math.round((r.count / totalConv) * 100) : 0,
  }));

  return {
    sourceDist,
    dailyConversations: dailyConversations.map((r) => ({
      date: r.date,
      count: r.count,
    })),
    avgSimilarity: Math.round(Number(avgSim) * 1000) / 1000,
    feedbackStats: { helpful, notHelpful, noFeedback },
    categoryUsage: categoryUsage.map((r) => ({
      category: r.category,
      count: r.count,
    })),
  };
}

export interface TopQuestion {
  id: string;
  question: string;
  category: string | null;
  matchCount: number;
}

/**
 * TOP 매칭 질문 (기간 내 가장 많이 매칭된 KB 항목)
 */
export async function getTopQuestions(
  db: Database,
  limit: number = 10,
  days: number = 30,
): Promise<TopQuestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      category: knowledgeItems.category,
      matchCount: count(),
    })
    .from(conversations)
    .innerJoin(
      knowledgeItems,
      sql`${conversations.matchedKbId} = ${knowledgeItems.id}`,
    )
    .where(
      and(
        isNotNull(conversations.matchedKbId),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(knowledgeItems.id, knowledgeItems.question, knowledgeItems.category)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return results;
}

export interface UnansweredQuestion {
  userMessage: string;
  count: number;
  lastAsked: string;
}

/**
 * 미답변(fallback) 질문 목록 — 빈도순
 */
export async function getUnansweredQuestions(
  db: Database,
  days: number = 30,
  limit: number = 50,
): Promise<UnansweredQuestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await db
    .select({
      userMessage: conversations.userMessage,
      count: count(),
      lastAsked: sql<string>`MAX(${conversations.createdAt})`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.responseSource, "fallback"),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(conversations.userMessage)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return results.map((r) => ({
    userMessage: r.userMessage,
    count: r.count,
    lastAsked: r.lastAsked,
  }));
}

export interface PopularQuestion {
  question: string;
}

/**
 * 최근 30일 가장 많이 매칭된 KB 질문 (quickReply용, 짧은 것만)
 */
export async function getPopularQuestions(
  db: Database,
  limit: number = 5,
): Promise<PopularQuestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const results = await db
    .select({
      question: knowledgeItems.question,
      matchCount: count(),
    })
    .from(conversations)
    .innerJoin(
      knowledgeItems,
      sql`${conversations.matchedKbId} = ${knowledgeItems.id}`,
    )
    .where(
      and(
        isNotNull(conversations.matchedKbId),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(knowledgeItems.id, knowledgeItems.question)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return results.map((r) => ({
    question: r.question,
  }));
}
