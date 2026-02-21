import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const customerLinks = pgTable(
  "customer_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // 카카오톡 사용자
    kakaoUserId: varchar("kakao_user_id", { length: 255 }).notNull().unique(),

    // 카카오싱크로 수집
    phoneNumber: varchar("phone_number", { length: 30 }),

    // Cafe24 고객 매칭
    cafe24CustomerId: varchar("cafe24_customer_id", { length: 255 }),
    cafe24MemberId: varchar("cafe24_member_id", { length: 255 }),

    // Cafe24 매칭 완료 시각
    linkedAt: timestamp("linked_at", { withTimezone: true }),

    // 운영자 메모
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_cl_phone_number").on(table.phoneNumber),
    index("idx_cl_cafe24_customer_id").on(table.cafe24CustomerId),
  ],
);
