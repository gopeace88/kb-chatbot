import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { listAllCustomers, getCustomerStats, getCustomerLink, upsertCustomerLink } from "@kb-chatbot/kb-engine";

const customers = new Hono<AppEnv>();

// GET /api/customers — 고객 목록
customers.get("/", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");
  const result = await listAllCustomers(db, { page, limit });
  return c.json(result);
});

// GET /api/customers/stats — 고객 통계
customers.get("/stats", async (c) => {
  const db = c.get("db");
  const result = await getCustomerStats(db);
  return c.json(result);
});

// GET /api/customers/:kakaoUserId — 개별 고객 조회
customers.get("/:kakaoUserId", async (c) => {
  const db = c.get("db");
  const kakaoUserId = c.req.param("kakaoUserId");
  const customer = await getCustomerLink(db, kakaoUserId);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json(customer);
});

// PATCH /api/customers/:kakaoUserId — 고객 메모 업데이트
customers.patch("/:kakaoUserId", async (c) => {
  const db = c.get("db");
  const kakaoUserId = c.req.param("kakaoUserId");
  const body = await c.req.json<{ notes?: string }>();
  await upsertCustomerLink(db, { kakaoUserId, notes: body.notes });
  return c.json({ ok: true });
});

export { customers };
