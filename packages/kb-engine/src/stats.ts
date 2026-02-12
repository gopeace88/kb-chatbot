import { eq, sql, count, gte, and } from "drizzle-orm";
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
