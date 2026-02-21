import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { listCustomerLinks, getCustomerStats, getCustomerLink } from "@kb-chatbot/kb-engine";

const customers = new Hono<AppEnv>();

// GET /api/customers — 고객 목록
customers.get("/", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");
  const result = await listCustomerLinks(db, { page, limit });
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

export { customers };
