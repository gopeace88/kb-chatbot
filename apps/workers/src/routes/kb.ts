import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import type { KBStatus } from "@kb-chatbot/shared";
import {
  listKBItems,
  getKBItem,
  createKBItem,
  updateKBItem,
  publishKBItem,
  archiveKBItem,
} from "@kb-chatbot/kb-engine";

const kb = new Hono<AppEnv>();

// GET /api/kb — KB 목록 (페이지네이션, 필터)
kb.get("/", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");
  const status = c.req.query("status") as KBStatus | undefined;
  const category = c.req.query("category");
  const search = c.req.query("search");

  const result = await listKBItems(db, {
    page,
    limit,
    status,
    category: category || undefined,
    search: search || undefined,
  });

  return c.json(result);
});

// GET /api/kb/:id — KB 상세
kb.get("/:id", async (c) => {
  const db = c.get("db");
  const item = await getKBItem(db, c.req.param("id"));

  if (!item) {
    return c.json({ error: "Knowledge item not found" }, 404);
  }

  return c.json(item);
});

// POST /api/kb — KB 생성
kb.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    question: string;
    answer: string;
    category?: string;
    tags?: string[];
    imageUrl?: string;
  }>();

  if (!body.question?.trim() || !body.answer?.trim()) {
    return c.json({ error: "question and answer are required" }, 400);
  }

  if (body.imageUrl && !/^https?:\/\//.test(body.imageUrl)) {
    return c.json({ error: "imageUrl must be a valid HTTP(S) URL" }, 400);
  }

  const item = await createKBItem(
    db,
    {
      question: body.question.trim(),
      answer: body.answer.trim(),
      category: body.category,
      tags: body.tags,
      imageUrl: body.imageUrl,
      createdBy: c.get("userEmail") ?? "operator",
    },
    c.env.OPENAI_API_KEY,
  );

  return c.json(item, 201);
});

// PUT /api/kb/:id — KB 수정
kb.put("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = await c.req.json<{
    question?: string;
    answer?: string;
    category?: string;
    tags?: string[];
    imageUrl?: string | null;
  }>();

  if (body.imageUrl && !/^https?:\/\//.test(body.imageUrl)) {
    return c.json({ error: "imageUrl must be a valid HTTP(S) URL" }, 400);
  }

  const item = await updateKBItem(db, id, body, c.env.OPENAI_API_KEY);

  if (!item) {
    return c.json({ error: "Knowledge item not found" }, 404);
  }

  return c.json(item);
});

// DELETE /api/kb/:id — KB 삭제 (soft delete → archived)
kb.delete("/:id", async (c) => {
  const db = c.get("db");
  const item = await archiveKBItem(db, c.req.param("id"));

  if (!item) {
    return c.json({ error: "Knowledge item not found" }, 404);
  }

  return c.json({ success: true });
});

// POST /api/kb/:id/publish — draft → published
kb.post("/:id/publish", async (c) => {
  const db = c.get("db");
  const confirmedBy = c.get("userEmail") ?? "operator";
  const item = await publishKBItem(db, c.req.param("id"), confirmedBy);

  if (!item) {
    return c.json({ error: "Knowledge item not found" }, 404);
  }

  return c.json(item);
});

// POST /api/kb/:id/archive — → archived
kb.post("/:id/archive", async (c) => {
  const db = c.get("db");
  const item = await archiveKBItem(db, c.req.param("id"));

  if (!item) {
    return c.json({ error: "Knowledge item not found" }, 404);
  }

  return c.json(item);
});

export { kb };
