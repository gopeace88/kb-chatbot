import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const cafe24Tokens = pgTable("cafe24_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),

  mallId: varchar("mall_id", { length: 100 }).notNull().unique(),

  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),

  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),

  scopes: text("scopes"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
