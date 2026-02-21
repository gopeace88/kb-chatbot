/**
 * customer_links CRUD
 *
 * 카카오톡 사용자 ↔ 전화번호 ↔ Cafe24 고객 매핑
 */

import { eq, sql, count, gte, isNotNull } from "drizzle-orm";
import { customerLinks, type Database } from "@kb-chatbot/database";

export interface CustomerLink {
  id: string;
  kakaoUserId: string;
  phoneNumber: string | null;
  cafe24CustomerId: string | null;
  cafe24MemberId: string | null;
  linkedAt: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerSummary {
  kakaoUserId: string;
  phoneNumber: string | null;
  cafe24CustomerId: string | null;
  conversationCount: number;
  lastConversationAt: Date | null;
}

export async function getCustomerLink(
  db: Database,
  kakaoUserId: string,
): Promise<CustomerLink | null> {
  const [row] = await db
    .select()
    .from(customerLinks)
    .where(eq(customerLinks.kakaoUserId, kakaoUserId))
    .limit(1);

  return row ?? null;
}

export interface ListCustomerLinksFilter {
  page?: number;
  limit?: number;
}

export async function listCustomerLinks(
  db: Database,
  filter: ListCustomerLinksFilter = {},
) {
  const page = filter.page || 1;
  const limit = filter.limit || 20;
  const offset = (page - 1) * limit;

  const [data, [{ total }]] = await Promise.all([
    db
      .select()
      .from(customerLinks)
      .orderBy(sql`${customerLinks.createdAt} DESC`)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(customerLinks),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function listAllCustomers(
  db: Database,
  filter: { page?: number; limit?: number } = {},
): Promise<{ data: CustomerSummary[]; total: number }> {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const offset = (page - 1) * limit;

  // conversations 테이블 기준으로 전체 사용자 조회 + customer_links LEFT JOIN
  const rows = await db.execute(sql`
    SELECT
      c.kakao_user_id,
      cl.phone_number,
      cl.cafe24_customer_id,
      COUNT(c.id)::int AS conversation_count,
      MAX(c.created_at) AS last_conversation_at
    FROM conversations c
    LEFT JOIN customer_links cl ON c.kakao_user_id = cl.kakao_user_id
    GROUP BY c.kakao_user_id, cl.phone_number, cl.cafe24_customer_id
    ORDER BY MAX(c.created_at) DESC NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRow = await db.execute(sql`
    SELECT COUNT(DISTINCT kakao_user_id)::int AS total FROM conversations
  `);

  const total = Number((countRow.rows[0] as { total: number }).total);

  const data: CustomerSummary[] = (rows.rows as {
    kakao_user_id: string;
    phone_number: string | null;
    cafe24_customer_id: string | null;
    conversation_count: number;
    last_conversation_at: string | null;
  }[]).map((row) => ({
    kakaoUserId: row.kakao_user_id,
    phoneNumber: row.phone_number ?? null,
    cafe24CustomerId: row.cafe24_customer_id ?? null,
    conversationCount: row.conversation_count,
    lastConversationAt: row.last_conversation_at ? new Date(row.last_conversation_at) : null,
  }));

  return { data, total };
}

export interface CustomerStats {
  totalCustomers: number;
  linkedCustomers: number;
  todayNew: number;
}

export async function getCustomerStats(
  db: Database,
): Promise<CustomerStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    [{ totalCustomers }],
    [{ linkedCustomers }],
    [{ todayNew }],
  ] = await Promise.all([
    db.select({ totalCustomers: count() }).from(customerLinks),
    db
      .select({ linkedCustomers: count() })
      .from(customerLinks)
      .where(isNotNull(customerLinks.cafe24CustomerId)),
    db
      .select({ todayNew: count() })
      .from(customerLinks)
      .where(gte(customerLinks.createdAt, todayStart)),
  ]);

  return { totalCustomers, linkedCustomers, todayNew };
}

export async function upsertCustomerLink(
  db: Database,
  data: {
    kakaoUserId: string;
    phoneNumber?: string | null;
    cafe24CustomerId?: string | null;
    cafe24MemberId?: string | null;
    linkedAt?: Date | null;
    notes?: string | null;
  },
): Promise<CustomerLink> {
  const now = new Date();

  const updateSet: Record<string, unknown> = { updatedAt: now };
  if (data.phoneNumber !== undefined) updateSet.phoneNumber = data.phoneNumber;
  if (data.cafe24CustomerId !== undefined) updateSet.cafe24CustomerId = data.cafe24CustomerId;
  if (data.cafe24MemberId !== undefined) updateSet.cafe24MemberId = data.cafe24MemberId;
  if (data.linkedAt !== undefined) updateSet.linkedAt = data.linkedAt;
  if (data.notes !== undefined) updateSet.notes = data.notes;

  const [row] = await db
    .insert(customerLinks)
    .values({
      kakaoUserId: data.kakaoUserId,
      phoneNumber: data.phoneNumber ?? null,
      cafe24CustomerId: data.cafe24CustomerId ?? null,
      cafe24MemberId: data.cafe24MemberId ?? null,
      linkedAt: data.linkedAt ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: customerLinks.kakaoUserId,
      set: updateSet,
    })
    .returning();

  return row;
}
