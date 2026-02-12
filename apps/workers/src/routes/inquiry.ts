import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import type { Channel, InquiryStatus } from "@kb-chatbot/shared";
import {
  listInquiries,
  getInquiry,
  answerInquiry,
  refineAndCreateKB,
  publishKBItem,
} from "@kb-chatbot/kb-engine";

const inquiry = new Hono<AppEnv>();

// GET /api/inquiries — 문의 목록 (필터: channel, status)
inquiry.get("/", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");
  const channel = c.req.query("channel") as Channel | undefined;
  const status = c.req.query("status") as InquiryStatus | undefined;

  const result = await listInquiries(db, { page, limit, channel, status });
  return c.json(result);
});

// GET /api/inquiries/:id — 문의 상세
inquiry.get("/:id", async (c) => {
  const db = c.get("db");
  const item = await getInquiry(db, c.req.param("id"));

  if (!item) {
    return c.json({ error: "Inquiry not found" }, 404);
  }

  return c.json(item);
});

// PUT /api/inquiries/:id/answer — 수동 답변
inquiry.put("/:id/answer", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{ answerText: string }>();

  if (!body.answerText?.trim()) {
    return c.json({ error: "answerText is required" }, 400);
  }

  const answeredBy = c.get("userEmail") ?? "operator";
  const item = await answerInquiry(
    db,
    c.req.param("id"),
    body.answerText.trim(),
    answeredBy,
  );

  if (!item) {
    return c.json({ error: "Inquiry not found" }, 404);
  }

  return c.json(item);
});

// POST /api/inquiries/:id/refine — AI Q&A 정제 트리거
inquiry.post("/:id/refine", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const existing = await getInquiry(db, id);
  if (!existing) {
    return c.json({ error: "Inquiry not found" }, 404);
  }
  if (!existing.answerText) {
    return c.json({ error: "Inquiry has no answer yet" }, 400);
  }

  const kbItem = await refineAndCreateKB(db, id, c.env.OPENAI_API_KEY);
  return c.json(kbItem, 201);
});

// POST /api/inquiries/:id/publish — 정제된 Q&A를 KB에 발행
inquiry.post("/:id/publish", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const existing = await getInquiry(db, id);
  if (!existing) {
    return c.json({ error: "Inquiry not found" }, 404);
  }
  if (!existing.knowledgeItemId) {
    return c.json({ error: "Inquiry has no refined KB item. Run refine first." }, 400);
  }

  const confirmedBy = c.get("userEmail") ?? "operator";
  const item = await publishKBItem(db, existing.knowledgeItemId, confirmedBy);

  if (!item) {
    return c.json({ error: "KB item not found" }, 404);
  }

  return c.json(item);
});

export { inquiry };
