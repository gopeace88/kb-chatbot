import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { AppEnv } from "../lib/env.js";
import { blockedTerms } from "@kb-chatbot/database";

const blockedTermsRoute = new Hono<AppEnv>();

// GET /api/blocked-terms — 차단 용어 목록 (최신순)
blockedTermsRoute.get("/", async (c) => {
  const db = c.get("db");

  const items = await db
    .select()
    .from(blockedTerms)
    .orderBy(desc(blockedTerms.createdAt));

  return c.json({ data: items });
});

// POST /api/blocked-terms — 차단 용어 생성
blockedTermsRoute.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json<{
    pattern: string;
    matchType?: "contains" | "exact" | "regex";
    reason?: string;
  }>();

  if (!body.pattern?.trim()) {
    return c.json({ error: "pattern is required" }, 400);
  }

  const createdBy =
    c.req.header("cf-access-authenticated-user-email") || "system";

  const [item] = await db
    .insert(blockedTerms)
    .values({
      pattern: body.pattern.trim(),
      matchType: body.matchType ?? "contains",
      reason: body.reason?.trim() || null,
      createdBy,
    })
    .returning();

  return c.json(item, 201);
});

// DELETE /api/blocked-terms/:id — 차단 용어 삭제
blockedTermsRoute.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(blockedTerms)
    .where(eq(blockedTerms.id, id))
    .returning();

  if (!deleted) {
    return c.json({ error: "Blocked term not found" }, 404);
  }

  return c.json({ success: true });
});

export { blockedTermsRoute };
