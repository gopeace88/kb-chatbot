import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { knowledgeItems } from "./knowledge-items";

export const knowledgeQuestionVariants = pgTable(
  "knowledge_question_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    questionEmbedding: vector("question_embedding", { dimensions: 1536 })
      .notNull(),
    source: varchar("source", { length: 50 }).notNull().default("ai_generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_kqv_knowledge_item").on(table.knowledgeItemId),
    uniqueIndex("uq_kqv_item_question").on(table.knowledgeItemId, table.question),
  ],
);
