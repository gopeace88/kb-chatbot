import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { getDashboardStats, getRAGStats, getTopQuestions, getUnansweredQuestions } from "@kb-chatbot/kb-engine";

const stats = new Hono<AppEnv>();

// GET /api/stats/dashboard — 대시보드 요약 통계
stats.get("/dashboard", async (c) => {
  const db = c.get("db");
  const result = await getDashboardStats(db);
  return c.json(result);
});

// GET /api/stats/rag — RAG 성능 종합 통계
stats.get("/rag", async (c) => {
  const db = c.get("db");
  const days = Number(c.req.query("days") || "7");
  const result = await getRAGStats(db, days);
  return c.json(result);
});

// GET /api/stats/top-questions — TOP 매칭 질문
stats.get("/top-questions", async (c) => {
  const db = c.get("db");
  const days = Number(c.req.query("days") || "30");
  const limit = Number(c.req.query("limit") || "10");
  const result = await getTopQuestions(db, limit, days);
  return c.json({ data: result });
});

// GET /api/stats/unanswered?days=30
stats.get("/unanswered", async (c) => {
  const db = c.get("db");
  const days = Number(c.req.query("days") || "30");
  const result = await getUnansweredQuestions(db, days);
  return c.json({ data: result });
});

export { stats };
