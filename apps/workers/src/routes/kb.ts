import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";

const kb = new Hono<AppEnv>();

/**
 * 지식 베이스 CRUD API
 * Phase 4에서 전체 구현
 */

// GET /api/kb - KB 목록
kb.get("/", async (c) => {
  // TODO: Phase 4
  return c.json({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
});

// GET /api/kb/:id - KB 상세
kb.get("/:id", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// POST /api/kb - KB 생성
kb.post("/", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// PUT /api/kb/:id - KB 수정
kb.put("/:id", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// DELETE /api/kb/:id - KB 삭제 (soft delete)
kb.delete("/:id", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// POST /api/kb/:id/publish - 발행
kb.post("/:id/publish", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

// POST /api/kb/:id/archive - 아카이브
kb.post("/:id/archive", async (c) => {
  // TODO: Phase 4
  return c.json({ error: "Not implemented" }, 501);
});

export { kb };
