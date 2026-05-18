import {
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

export const queryEmbeddingCache = pgTable(
  "query_embedding_cache",
  {
    textNorm: text("text_norm").primaryKey(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
