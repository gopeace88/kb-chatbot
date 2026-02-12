import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { listConversations, getConversationStats } from "@kb-chatbot/kb-engine";

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

export { conversationsRoute };
