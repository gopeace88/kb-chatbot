import { Hono } from "hono";
import type { Env } from "../lib/env.js";

const collector = new Hono<{ Bindings: Env }>();

/**
 * 마켓플레이스 수집 API
 * Phase 6에서 전체 구현
 */

// POST /api/collector/coupang/sync
collector.post("/coupang/sync", async (c) => {
  // TODO: Phase 6
  return c.json({ error: "Not implemented" }, 501);
});

// POST /api/collector/naver/sync
collector.post("/naver/sync", async (c) => {
  // TODO: Phase 6
  return c.json({ error: "Not implemented" }, 501);
});

// GET /api/collector/logs
collector.get("/logs", async (c) => {
  // TODO: Phase 6
  return c.json({ data: [] });
});

export { collector };
