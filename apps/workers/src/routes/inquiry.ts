import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";

const inquiry = new Hono<AppEnv>();

/**
 * 문의 관리 API
 * Phase 4에서 전체 구현
 */

// GET /api/inquiries - 문의 목록
inquiry.get("/", async (c) => {
  // TODO: Phase 4
  return c.json({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
});

// GET /api/inquiries/:id - 문의 상세
inquiry.get("/:id", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// PUT /api/inquiries/:id/answer - 수동 답변
inquiry.put("/:id/answer", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// POST /api/inquiries/:id/refine - AI 정제 트리거
inquiry.post("/:id/refine", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// POST /api/inquiries/:id/publish - KB에 등록
inquiry.post("/:id/publish", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

export { inquiry };
