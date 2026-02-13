/**
 * customer_links CRUD
 *
 * 카카오톡 사용자 ↔ 전화번호 ↔ Cafe24 고객 매핑
 */

import { eq } from "drizzle-orm";
import { customerLinks, type Database } from "@kb-chatbot/database";

export interface CustomerLink {
  id: string;
  kakaoUserId: string;
  phoneNumber: string | null;
  cafe24CustomerId: string | null;
  cafe24MemberId: string | null;
  linkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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

export async function upsertCustomerLink(
  db: Database,
  data: {
    kakaoUserId: string;
    phoneNumber?: string | null;
    cafe24CustomerId?: string | null;
    cafe24MemberId?: string | null;
    linkedAt?: Date | null;
  },
): Promise<CustomerLink> {
  const now = new Date();

  const updateSet: Record<string, unknown> = { updatedAt: now };
  if (data.phoneNumber !== undefined) updateSet.phoneNumber = data.phoneNumber;
  if (data.cafe24CustomerId !== undefined) updateSet.cafe24CustomerId = data.cafe24CustomerId;
  if (data.cafe24MemberId !== undefined) updateSet.cafe24MemberId = data.cafe24MemberId;
  if (data.linkedAt !== undefined) updateSet.linkedAt = data.linkedAt;

  const [row] = await db
    .insert(customerLinks)
    .values({
      kakaoUserId: data.kakaoUserId,
      phoneNumber: data.phoneNumber ?? null,
      cafe24CustomerId: data.cafe24CustomerId ?? null,
      cafe24MemberId: data.cafe24MemberId ?? null,
      linkedAt: data.linkedAt ?? null,
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
