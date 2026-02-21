import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { listAllCustomers, getCustomerStats, getCustomerLink, upsertCustomerLink, addCustomerNote, listCustomerNotes } from "@kb-chatbot/kb-engine";

const customers = new Hono<AppEnv>();

// GET /api/customers — 고객 목록
customers.get("/", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");
  const search = c.req.query("search") || undefined;
  const result = await listAllCustomers(db, { page, limit, search });
  return c.json(result);
});

// GET /api/customers/stats — 고객 통계
customers.get("/stats", async (c) => {
  const db = c.get("db");
  const result = await getCustomerStats(db);
  return c.json(result);
});

// GET /api/customers/:kakaoUserId/notes — 메모 목록
customers.get("/:kakaoUserId/notes", async (c) => {
  const db = c.get("db");
  const kakaoUserId = c.req.param("kakaoUserId");
  const notes = await listCustomerNotes(db, kakaoUserId);
  return c.json(notes);
});

// POST /api/customers/:kakaoUserId/notes — 메모 추가
customers.post("/:kakaoUserId/notes", async (c) => {
  const db = c.get("db");
  const kakaoUserId = c.req.param("kakaoUserId");
  const body = await c.req.json<{ content: string }>();
  if (!body.content?.trim()) return c.json({ error: "content required" }, 400);
  const note = await addCustomerNote(db, kakaoUserId, body.content.trim());
  return c.json(note, 201);
});

// GET /api/customers/:kakaoUserId — 개별 고객 조회
customers.get("/:kakaoUserId", async (c) => {
  const db = c.get("db");
  const kakaoUserId = c.req.param("kakaoUserId");
  const customer = await getCustomerLink(db, kakaoUserId);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json(customer);
});

export { customers };
