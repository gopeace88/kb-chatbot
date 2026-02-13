import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { kbStatusEnum } from "./enums";

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Q&A 내용
    question: text("question").notNull(),
    answer: text("answer").notNull(),

    // 벡터
    questionEmbedding: vector("question_embedding", { dimensions: 1536 }),

    // 메타데이터
    category: varchar("category", { length: 100 }),
    tags: text("tags").array(),
    sourceInquiryId: uuid("source_inquiry_id"),

    // 상태
    status: kbStatusEnum("status").notNull().default("draft"),

    // 사용 통계
    usageCount: integer("usage_count").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),

    // 감사
    createdBy: varchar("created_by", { length: 255 }),
    confirmedBy: varchar("confirmed_by", { length: 255 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ki_status").on(table.status),
    index("idx_ki_category").on(table.category),
  ],
);
