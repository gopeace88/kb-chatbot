import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { syncStatusEnum, syncTypeEnum } from "./enums.js";

export const collectorSyncLogs = pgTable("collector_sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),

  platform: varchar("platform", { length: 50 }).notNull(),
  syncType: syncTypeEnum("sync_type").notNull(),
  status: syncStatusEnum("status").notNull(),

  recordsFetched: integer("records_fetched").default(0),
  recordsCreated: integer("records_created").default(0),
  errorMessage: text("error_message"),

  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
