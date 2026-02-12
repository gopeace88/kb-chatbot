import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { getDashboardStats } from "@kb-chatbot/kb-engine";

const stats = new Hono<AppEnv>();

// GET /api/stats/dashboard — 대시보드 요약 통계
stats.get("/dashboard", async (c) => {
  const db = c.get("db");
  const result = await getDashboardStats(db);
  return c.json(result);
});

export { stats };
