import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { channelEnum, inquiryStatusEnum } from "./enums";
import { knowledgeItems } from "./knowledge-items";

export const rawInquiries = pgTable(
  "raw_inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // 출처
    channel: channelEnum("channel").notNull(),
    externalId: varchar("external_id", { length: 255 }),

    // 내용
    customerName: varchar("customer_name", { length: 255 }),
    questionText: text("question_text").notNull(),
    answerText: text("answer_text"),
    questionEmbedding: vector("question_embedding", { dimensions: 1536 }),

    // AI 분석
    aiCategory: varchar("ai_category", { length: 100 }),
    aiSummary: text("ai_summary"),

    // 상태
    status: inquiryStatusEnum("status").notNull().default("new"),

    // KB 연결
    knowledgeItemId: uuid("knowledge_item_id").references(
      () => knowledgeItems.id,
    ),

    // 메타
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    answeredBy: varchar("answered_by", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ri_channel_status").on(table.channel, table.status),
    unique("uq_ri_channel_external").on(table.channel, table.externalId),
  ],
);
