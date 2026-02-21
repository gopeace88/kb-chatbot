import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const customerNotes = pgTable(
  "customer_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kakaoUserId: varchar("kakao_user_id", { length: 255 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_cn_kakao_user_id").on(table.kakaoUserId),
  ],
);
