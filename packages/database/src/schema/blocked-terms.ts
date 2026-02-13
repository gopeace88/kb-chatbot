import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const matchTypeEnum = pgEnum("match_type", ["contains", "exact", "regex"]);

export const blockedTerms = pgTable("blocked_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  pattern: varchar("pattern", { length: 500 }).notNull(),
  matchType: matchTypeEnum("match_type").notNull().default("contains"),
  reason: varchar("reason", { length: 255 }),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
