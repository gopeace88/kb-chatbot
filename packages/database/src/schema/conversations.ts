import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { responseSourceEnum } from "./enums";
import { knowledgeItems } from "./knowledge-items";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // 카카오 사용자
    kakaoUserId: varchar("kakao_user_id", { length: 255 }).notNull(),

    // 대화
    userMessage: text("user_message").notNull(),
    botResponse: text("bot_response").notNull(),

    // 답변 출처
    responseSource: responseSourceEnum("response_source").notNull(),
    matchedKbId: uuid("matched_kb_id").references(() => knowledgeItems.id),
    similarityScore: real("similarity_score"),

    // 피드백
    wasHelpful: boolean("was_helpful"),

    // 상담사 응답 (미해결 문의 관리)
    agentResponse: text("agent_response"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_conv_kakao_user").on(table.kakaoUserId, table.createdAt),
    index("idx_conv_source").on(table.responseSource),
  ],
);
