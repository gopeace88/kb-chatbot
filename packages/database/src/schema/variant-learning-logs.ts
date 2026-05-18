import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { knowledgeItems } from "./knowledge-items";
import { knowledgeQuestionVariants } from "./knowledge-question-variants";

export const variantLearningLogs = pgTable(
  "variant_learning_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userMessage: text("user_message").notNull(),
    knowledgeItemId: uuid("knowledge_item_id").references(() => knowledgeItems.id, {
      onDelete: "set null",
    }),
    knowledgeQuestionVariantId: uuid("knowledge_question_variant_id").references(
      () => knowledgeQuestionVariants.id,
      { onDelete: "set null" },
    ),
    decision: varchar("decision", { length: 20 }).notNull(),
    suggestedQuestion: text("suggested_question"),
    reason: text("reason"),
    similarity: real("similarity"),
    sourceCount: integer("source_count").notNull().default(1),
    lastAskedAt: timestamp("last_asked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_variant_learning_logs_created_at").on(table.createdAt),
    index("idx_variant_learning_logs_decision").on(table.decision),
    index("idx_variant_learning_logs_knowledge_item").on(table.knowledgeItemId),
  ],
);
