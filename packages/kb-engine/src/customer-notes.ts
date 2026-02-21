import { sql } from "drizzle-orm";
import type { Database } from "@kb-chatbot/database";

export interface CustomerNote {
  id: string;
  kakaoUserId: string;
  content: string;
  createdAt: string;
}

export async function addCustomerNote(
  db: Database,
  kakaoUserId: string,
  content: string,
): Promise<CustomerNote> {
  const rows = await db.execute(sql`
    INSERT INTO customer_notes (kakao_user_id, content)
    VALUES (${kakaoUserId}, ${content})
    RETURNING id, kakao_user_id, content, created_at
  `);
  const r = rows.rows[0] as { id: string; kakao_user_id: string; content: string; created_at: string };
  return {
    id: r.id,
    kakaoUserId: r.kakao_user_id,
    content: r.content,
    createdAt: r.created_at,
  };
}

export async function listCustomerNotes(
  db: Database,
  kakaoUserId: string,
): Promise<CustomerNote[]> {
  const rows = await db.execute(sql`
    SELECT id, kakao_user_id, content, created_at
    FROM customer_notes
    WHERE kakao_user_id = ${kakaoUserId}
    ORDER BY created_at DESC
  `);
  return (rows.rows as { id: string; kakao_user_id: string; content: string; created_at: string }[]).map((r) => ({
    id: r.id,
    kakaoUserId: r.kakao_user_id,
    content: r.content,
    createdAt: r.created_at,
  }));
}
