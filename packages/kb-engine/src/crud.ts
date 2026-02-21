import { eq, desc, sql, and, ilike, inArray, count, isNull, gte } from "drizzle-orm";
import {
  knowledgeItems,
  rawInquiries,
  conversations,
  customerLinks,
  type Database,
} from "@kb-chatbot/database";
import type {
  KBStatus,
  Channel,
  InquiryStatus,
  PaginationParams,
} from "@kb-chatbot/shared";
import { generateEmbedding } from "./embedding.js";

// ── Knowledge Items CRUD ──

export interface CreateKBItemInput {
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
  sourceInquiryId?: string;
  createdBy?: string;
  imageUrl?: string;
  status?: "draft" | "published";
}

export interface UpdateKBItemInput {
  question?: string;
  answer?: string;
  category?: string;
  tags?: string[];
  imageUrl?: string | null;
}

export async function createKBItem(
  db: Database,
  input: CreateKBItemInput,
  openaiApiKey: string,
  embeddingOptions?: { baseUrl?: string },
) {
  const embedding = await generateEmbedding(input.question, openaiApiKey, embeddingOptions);

  const [item] = await db
    .insert(knowledgeItems)
    .values({
      question: input.question,
      answer: input.answer,
      questionEmbedding: embedding,
      category: input.category ?? null,
      tags: input.tags ?? null,
      sourceInquiryId: input.sourceInquiryId ?? null,
      createdBy: input.createdBy ?? null,
      imageUrl: input.imageUrl ?? null,
      status: input.status ?? "draft",
    })
    .returning();

  return item;
}

export async function updateKBItem(
  db: Database,
  id: string,
  input: UpdateKBItemInput,
  openaiApiKey: string,
  embeddingOptions?: { baseUrl?: string },
) {
  // 질문이 변경되면 임베딩 재생성
  let embedding: number[] | undefined;
  if (input.question) {
    embedding = await generateEmbedding(input.question, openaiApiKey, embeddingOptions);
  }

  const [item] = await db
    .update(knowledgeItems)
    .set({
      ...(input.question && { question: input.question }),
      ...(input.answer && { answer: input.answer }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(embedding && { questionEmbedding: embedding }),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeItems.id, id))
    .returning();

  return item ?? null;
}

export async function getKBItem(db: Database, id: string) {
  const [item] = await db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.id, id))
    .limit(1);

  return item ?? null;
}

export interface ListKBItemsFilter extends PaginationParams {
  status?: KBStatus;
  category?: string;
  search?: string;
}

export async function listKBItems(db: Database, filter: ListKBItemsFilter) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (filter.status) {
    conditions.push(eq(knowledgeItems.status, filter.status));
  }
  if (filter.category) {
    conditions.push(eq(knowledgeItems.category, filter.category));
  }
  if (filter.search) {
    conditions.push(
      sql`(${ilike(knowledgeItems.question, `%${filter.search}%`)} OR ${ilike(knowledgeItems.answer, `%${filter.search}%`)})`,
    );
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: knowledgeItems.id,
        question: knowledgeItems.question,
        answer: knowledgeItems.answer,
        category: knowledgeItems.category,
        tags: knowledgeItems.tags,
        status: knowledgeItems.status,
        usageCount: knowledgeItems.usageCount,
        helpfulCount: knowledgeItems.helpfulCount,
        createdBy: knowledgeItems.createdBy,
        confirmedBy: knowledgeItems.confirmedBy,
        imageUrl: knowledgeItems.imageUrl,
        confirmedAt: knowledgeItems.confirmedAt,
        createdAt: knowledgeItems.createdAt,
        updatedAt: knowledgeItems.updatedAt,
      })
      .from(knowledgeItems)
      .where(whereClause)
      .orderBy(desc(knowledgeItems.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(knowledgeItems)
      .where(whereClause),
  ]);

  return {
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function publishKBItem(
  db: Database,
  id: string,
  confirmedBy: string,
) {
  const [item] = await db
    .update(knowledgeItems)
    .set({
      status: "published",
      confirmedBy,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeItems.id, id))
    .returning();

  return item ?? null;
}

export async function archiveKBItem(db: Database, id: string) {
  const [item] = await db
    .update(knowledgeItems)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(eq(knowledgeItems.id, id))
    .returning();

  return item ?? null;
}

export async function incrementUsageCount(db: Database, kbId: string) {
  await db
    .update(knowledgeItems)
    .set({
      usageCount: sql`${knowledgeItems.usageCount} + 1`,
    })
    .where(eq(knowledgeItems.id, kbId));
}

export async function updateHelpful(
  db: Database,
  kbId: string,
  helpful: boolean,
) {
  if (helpful) {
    await db
      .update(knowledgeItems)
      .set({
        helpfulCount: sql`${knowledgeItems.helpfulCount} + 1`,
      })
      .where(eq(knowledgeItems.id, kbId));
  }
}

// ── Raw Inquiries CRUD ──

export interface CreateInquiryInput {
  channel: Channel;
  externalId?: string;
  customerName?: string;
  questionText: string;
  answerText?: string;
  answeredBy?: string;
}

export async function createInquiry(
  db: Database,
  input: CreateInquiryInput,
  openaiApiKey: string,
) {
  const embedding = await generateEmbedding(
    input.questionText,
    openaiApiKey,
  );

  const [inquiry] = await db
    .insert(rawInquiries)
    .values({
      channel: input.channel,
      externalId: input.externalId ?? null,
      customerName: input.customerName ?? null,
      questionText: input.questionText,
      answerText: input.answerText ?? null,
      questionEmbedding: embedding,
      status: input.answerText ? "answered" : "new",
      answeredAt: input.answerText ? new Date() : null,
      answeredBy: input.answeredBy ?? null,
    })
    .returning();

  return inquiry;
}

export interface ListInquiriesFilter extends PaginationParams {
  channel?: Channel;
  status?: InquiryStatus;
}

export async function listInquiries(
  db: Database,
  filter: ListInquiriesFilter,
) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (filter.channel) {
    conditions.push(eq(rawInquiries.channel, filter.channel));
  }
  if (filter.status) {
    conditions.push(eq(rawInquiries.status, filter.status));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: rawInquiries.id,
        channel: rawInquiries.channel,
        externalId: rawInquiries.externalId,
        customerName: rawInquiries.customerName,
        questionText: rawInquiries.questionText,
        answerText: rawInquiries.answerText,
        aiCategory: rawInquiries.aiCategory,
        aiSummary: rawInquiries.aiSummary,
        status: rawInquiries.status,
        knowledgeItemId: rawInquiries.knowledgeItemId,
        receivedAt: rawInquiries.receivedAt,
        answeredAt: rawInquiries.answeredAt,
        answeredBy: rawInquiries.answeredBy,
        createdAt: rawInquiries.createdAt,
      })
      .from(rawInquiries)
      .where(whereClause)
      .orderBy(desc(rawInquiries.receivedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(rawInquiries)
      .where(whereClause),
  ]);

  return {
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getInquiry(db: Database, id: string) {
  const [inquiry] = await db
    .select()
    .from(rawInquiries)
    .where(eq(rawInquiries.id, id))
    .limit(1);

  return inquiry ?? null;
}

export async function answerInquiry(
  db: Database,
  id: string,
  answerText: string,
  answeredBy: string,
) {
  const [inquiry] = await db
    .update(rawInquiries)
    .set({
      answerText,
      answeredBy,
      answeredAt: new Date(),
      status: "answered",
      updatedAt: new Date(),
    })
    .where(eq(rawInquiries.id, id))
    .returning();

  return inquiry ?? null;
}

/**
 * 문의를 AI로 정제 후 KB 아이템으로 등록
 * refine → KB 생성 → 문의 상태 업데이트
 */
export async function refineAndCreateKB(
  db: Database,
  inquiryId: string,
  openaiApiKey: string,
  confirmedBy?: string,
) {
  const inquiry = await getInquiry(db, inquiryId);
  if (!inquiry || !inquiry.answerText) {
    throw new Error("Inquiry not found or has no answer");
  }

  // 동적 import로 순환 의존 방지
  const { refineInquiry } = await import("./refine.js");

  const refined = await refineInquiry(
    inquiry.questionText,
    inquiry.answerText,
    openaiApiKey,
  );

  // KB 아이템 생성
  const kbItem = await createKBItem(
    db,
    {
      question: refined.question,
      answer: refined.answer,
      category: refined.category,
      sourceInquiryId: inquiryId,
      createdBy: "AI",
    },
    openaiApiKey,
  );

  // 문의 상태 업데이트
  await db
    .update(rawInquiries)
    .set({
      status: "refined",
      aiCategory: refined.category,
      aiSummary: refined.question,
      knowledgeItemId: kbItem.id,
      updatedAt: new Date(),
    })
    .where(eq(rawInquiries.id, inquiryId));

  return kbItem;
}

// ── Conversations ──

export interface CreateConversationInput {
  kakaoUserId: string;
  userMessage: string;
  botResponse: string;
  responseSource: "kb_match" | "ai_generated" | "fallback";
  matchedKbId?: string;
  similarityScore?: number;
}

export async function createConversation(
  db: Database,
  input: CreateConversationInput,
) {
  const [conv] = await db
    .insert(conversations)
    .values({
      kakaoUserId: input.kakaoUserId,
      userMessage: input.userMessage,
      botResponse: input.botResponse,
      responseSource: input.responseSource,
      matchedKbId: input.matchedKbId ?? null,
      similarityScore: input.similarityScore ?? null,
    })
    .returning();

  return conv;
}

export async function listConversations(
  db: Database,
  filter: PaginationParams & { kakaoUserId?: string },
) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;
  const offset = (page - 1) * limit;

  const userIdCondition = filter.kakaoUserId
    ? sql`WHERE c.kakao_user_id = ${filter.kakaoUserId}`
    : sql``;

  const [rows, countRows] = await Promise.all([
    db.execute(sql`
      SELECT
        c.id,
        c.kakao_user_id,
        c.user_message,
        c.bot_response,
        c.response_source,
        c.matched_kb_id,
        c.similarity_score,
        c.was_helpful,
        c.agent_response,
        c.resolved_at,
        c.resolved_by,
        c.created_at,
        cl.phone_number,
        cl.cafe24_customer_id
      FROM conversations c
      LEFT JOIN customer_links cl ON c.kakao_user_id = cl.kakao_user_id
      ${userIdCondition}
      ORDER BY c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM conversations c
      ${userIdCondition}
    `),
  ]);

  type ConvRow = {
    id: string;
    kakao_user_id: string;
    user_message: string;
    bot_response: string;
    response_source: string;
    matched_kb_id: string | null;
    similarity_score: number | null;
    was_helpful: boolean | null;
    agent_response: string | null;
    resolved_at: Date | null;
    resolved_by: string | null;
    created_at: Date;
    phone_number: string | null;
    cafe24_customer_id: string | null;
  };

  const items = (rows.rows as unknown as ConvRow[]).map((r) => ({
    id: r.id,
    kakaoUserId: r.kakao_user_id,
    userMessage: r.user_message,
    botResponse: r.bot_response,
    responseSource: r.response_source as "kb_match" | "ai_generated" | "fallback",
    matchedKbId: r.matched_kb_id,
    similarityScore: r.similarity_score,
    wasHelpful: r.was_helpful,
    agentResponse: r.agent_response,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at,
    phoneNumber: r.phone_number,
    cafe24CustomerId: r.cafe24_customer_id,
  }));

  const total = ((countRows.rows as unknown as { total: number }[])[0]?.total) ?? 0;

  return {
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * 특정 카카오 사용자의 가장 최근 대화 조회
 */
export async function getLatestConversation(
  db: Database,
  kakaoUserId: string,
) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.kakaoUserId, kakaoUserId))
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  return conv ?? null;
}

export async function updateConversationFeedback(
  db: Database,
  conversationId: string,
  wasHelpful: boolean,
) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) return null;

  // 피드백 저장
  await db
    .update(conversations)
    .set({ wasHelpful })
    .where(eq(conversations.id, conversationId));

  // 매칭된 KB 아이템의 helpful 카운트 업데이트
  if (conv.matchedKbId) {
    await updateHelpful(db, conv.matchedKbId, wasHelpful);
  }

  return conv;
}

// ── 미해결 문의 관리 ──

/**
 * 미해결(fallback) 대화 목록 — 상담사 미응답 건
 */
export async function listUnresolvedConversations(
  db: Database,
  filter: PaginationParams & { days?: number },
) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;
  const offset = (page - 1) * limit;
  const days = filter.days ?? 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [rows, countRows] = await Promise.all([
    db.execute(sql`
      SELECT
        c.id,
        c.kakao_user_id,
        c.user_message,
        c.bot_response,
        c.response_source,
        c.matched_kb_id,
        c.similarity_score,
        c.was_helpful,
        c.agent_response,
        c.resolved_at,
        c.resolved_by,
        c.created_at,
        cl.phone_number,
        cl.cafe24_customer_id
      FROM conversations c
      LEFT JOIN customer_links cl ON c.kakao_user_id = cl.kakao_user_id
      WHERE c.response_source = 'fallback'
        AND c.resolved_at IS NULL
        AND c.created_at >= ${since}
      ORDER BY c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM conversations c
      WHERE c.response_source = 'fallback'
        AND c.resolved_at IS NULL
        AND c.created_at >= ${since}
    `),
  ]);

  type ConvRow = {
    id: string;
    kakao_user_id: string;
    user_message: string;
    bot_response: string;
    response_source: string;
    matched_kb_id: string | null;
    similarity_score: number | null;
    was_helpful: boolean | null;
    agent_response: string | null;
    resolved_at: Date | null;
    resolved_by: string | null;
    created_at: Date;
    phone_number: string | null;
    cafe24_customer_id: string | null;
  };

  const items = (rows.rows as unknown as ConvRow[]).map((r) => ({
    id: r.id,
    kakaoUserId: r.kakao_user_id,
    userMessage: r.user_message,
    botResponse: r.bot_response,
    responseSource: r.response_source as "kb_match" | "ai_generated" | "fallback",
    matchedKbId: r.matched_kb_id,
    similarityScore: r.similarity_score,
    wasHelpful: r.was_helpful,
    agentResponse: r.agent_response,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at,
    phoneNumber: r.phone_number,
    cafe24CustomerId: r.cafe24_customer_id,
  }));

  const total = ((countRows.rows as unknown as { total: number }[])[0]?.total) ?? 0;

  return {
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * 미해결 문의에 상담사 답변 저장
 */
export async function resolveConversation(
  db: Database,
  conversationId: string,
  agentResponse: string,
  resolvedBy?: string,
) {
  const [updated] = await db
    .update(conversations)
    .set({
      agentResponse,
      resolvedAt: new Date(),
      resolvedBy: resolvedBy ?? "agent",
    })
    .where(eq(conversations.id, conversationId))
    .returning();

  return updated ?? null;
}
