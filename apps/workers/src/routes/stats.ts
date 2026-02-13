import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { getDashboardStats, getRAGStats } from "@kb-chatbot/kb-engine";

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
  const result = await getRAGStats(db);
  return c.json(result);
});

export { stats };
