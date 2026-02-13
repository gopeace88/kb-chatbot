import { pgEnum } from "drizzle-orm/pg-core";

export const channelEnum = pgEnum("channel", [
  "kakao",
  "coupang",
  "naver",
  "cafe24",
  "manual",
]);

export const kbStatusEnum = pgEnum("kb_status", [
  "draft",
  "published",
  "archived",
]);

export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "new",
  "answered",
  "refined",
  "published",
  "ignored",
]);

export const responseSourceEnum = pgEnum("response_source", [
  "kb_match",
  "ai_generated",
  "fallback",
]);

export const syncTypeEnum = pgEnum("sync_type", ["full", "incremental"]);

export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "completed",
  "failed",
]);
