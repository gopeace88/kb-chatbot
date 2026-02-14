import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { listConversations, getConversationStats, listUnresolvedConversations, resolveConversation } from "@kb-chatbot/kb-engine";

const conversationsRoute = new Hono<AppEnv>();

// GET /api/conversations — 대화 목록
conversationsRoute.get("/", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "50");
  const kakaoUserId = c.req.query("kakaoUserId");

  const result = await listConversations(db, {
    page,
    limit,
    kakaoUserId: kakaoUserId || undefined,
  });

  return c.json(result);
});

// GET /api/conversations/stats — 대화 통계
conversationsRoute.get("/stats", async (c) => {
  const db = c.get("db");
  const days = Number(c.req.query("days") || "7");

  const stats = await getConversationStats(db, days);
  return c.json(stats);
});

// GET /api/conversations/unresolved — 미해결 문의 목록
conversationsRoute.get("/unresolved", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const days = Number(c.req.query("days") || "30");

  const result = await listUnresolvedConversations(db, { page, days });
  return c.json(result);
});

// POST /api/conversations/:id/resolve — 미해결 문의 상담사 답변
conversationsRoute.post("/:id/resolve", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = await c.req.json<{ agentResponse: string; resolvedBy?: string }>();

  if (!body.agentResponse?.trim()) {
    return c.json({ error: "agentResponse is required" }, 400);
  }

  const result = await resolveConversation(db, id, body.agentResponse, body.resolvedBy);
  if (!result) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  return c.json({ data: result });
});

export { conversationsRoute };
