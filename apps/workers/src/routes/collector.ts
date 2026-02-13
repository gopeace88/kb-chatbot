import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { CoupangClient } from "../lib/coupang-client.js";
import { NaverCommerceClient } from "../lib/naver-client.js";
import {
  syncCoupang,
  syncNaver,
  syncCafe24,
  listSyncLogs,
} from "../lib/collector.js";
import { Cafe24Client } from "../lib/cafe24-client.js";
import { DbTokenStore } from "../lib/cafe24-token-store.js";

const collector = new Hono<AppEnv>();

/**
 * POST /api/collector/coupang/sync
 * 쿠팡 문의 수집 트리거
 * Body: { syncType?: "full" | "incremental" }
 */
collector.post("/coupang/sync", async (c) => {
  const db = c.get("db");
  const env = c.env;

  if (!env.COUPANG_ACCESS_KEY || !env.COUPANG_SECRET_KEY || !env.COUPANG_VENDOR_ID) {
    return c.json({ error: "쿠팡 API 키가 설정되지 않았습니다." }, 400);
  }

  const body = await c.req.json<{ syncType?: "full" | "incremental" }>().catch(() => ({}));
  const syncType = body.syncType || "incremental";

  const client = new CoupangClient({
    accessKey: env.COUPANG_ACCESS_KEY,
    secretKey: env.COUPANG_SECRET_KEY,
    vendorId: env.COUPANG_VENDOR_ID,
  });

  const result = await syncCoupang(db, client, env.OPENAI_API_KEY, syncType);

  return c.json(result);
});

/**
 * POST /api/collector/naver/sync
 * 네이버 문의 수집 트리거
 * Body: { syncType?: "full" | "incremental" }
 */
collector.post("/naver/sync", async (c) => {
  const db = c.get("db");
  const env = c.env;

  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    return c.json({ error: "네이버 API 키가 설정되지 않았습니다." }, 400);
  }

  const body = await c.req.json<{ syncType?: "full" | "incremental" }>().catch(() => ({}));
  const syncType = body.syncType || "incremental";

  const client = new NaverCommerceClient({
    clientId: env.NAVER_CLIENT_ID,
    clientSecret: env.NAVER_CLIENT_SECRET,
  });

  const result = await syncNaver(db, client, env.OPENAI_API_KEY, syncType);

  return c.json(result);
});

/**
 * POST /api/collector/cafe24/sync
 * Cafe24 Q&A 수집 트리거
 * Body: { syncType?: "full" | "incremental", boardNo?: number }
 */
collector.post("/cafe24/sync", async (c) => {
  const db = c.get("db");
  const env = c.env;

  if (!env.CAFE24_MALL_ID || !env.CAFE24_CLIENT_ID || !env.CAFE24_CLIENT_SECRET) {
    return c.json({ error: "Cafe24 API 키가 설정되지 않았습니다." }, 400);
  }

  const body = await c.req
    .json<{ syncType?: "full" | "incremental"; boardNo?: number }>()
    .catch(() => ({}));
  const syncType = body.syncType || "incremental";
  const boardNo = body.boardNo || 4;

  const tokenStore = new DbTokenStore(db);
  const client = new Cafe24Client({
    mallId: env.CAFE24_MALL_ID,
    clientId: env.CAFE24_CLIENT_ID,
    clientSecret: env.CAFE24_CLIENT_SECRET,
    tokenStore,
  });

  const result = await syncCafe24(db, client, env.OPENAI_API_KEY, boardNo, syncType);

  return c.json(result);
});

/**
 * GET /api/collector/logs
 * 수집 동기화 로그 조회
 * Query: limit (default 50)
 */
collector.get("/logs", async (c) => {
  const db = c.get("db");
  const limit = Number(c.req.query("limit") || "50");

  const logs = await listSyncLogs(db, { limit });

  return c.json({ data: logs });
});

export { collector };
