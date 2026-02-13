/**
 * Cafe24 OAuth 라우트 (초기 셋업용)
 *
 * 1회성 인증 흐름:
 * 1. GET /api/cafe24/oauth/start → Cafe24 인증 페이지로 리다이렉트
 * 2. GET /api/cafe24/oauth/callback → 코드→토큰 교환 → DB 저장
 */

import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { Cafe24Client } from "../lib/cafe24-client.js";
import { DbTokenStore } from "../lib/cafe24-token-store.js";

const cafe24OAuth = new Hono<AppEnv>();

const CAFE24_SCOPES = [
  "mall.read_customer",
  "mall.read_order",
  "mall.read_community",
].join(",");

/**
 * GET /api/cafe24/oauth/start
 * Cafe24 인증 페이지로 리다이렉트
 */
cafe24OAuth.get("/start", (c) => {
  const env = c.env;
  const callbackUrl = new URL(c.req.url);
  callbackUrl.pathname = "/api/cafe24/oauth/callback";
  callbackUrl.search = "";

  const authUrl = new URL(
    `https://${env.CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/authorize`,
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", env.CAFE24_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authUrl.searchParams.set("scope", CAFE24_SCOPES);

  return c.redirect(authUrl.toString());
});

/**
 * GET /api/cafe24/oauth/callback
 * Cafe24 인가 코드 → 토큰 교환 → DB 저장
 */
cafe24OAuth.get("/callback", async (c) => {
  const env = c.env;
  const code = c.req.query("code");

  if (!code) {
    return c.json({ error: "인가 코드가 없습니다." }, 400);
  }

  const callbackUrl = new URL(c.req.url);
  callbackUrl.search = "";
  const redirectUri = callbackUrl.toString();

  const db = c.get("db");
  const tokenStore = new DbTokenStore(db);

  const client = new Cafe24Client({
    mallId: env.CAFE24_MALL_ID,
    clientId: env.CAFE24_CLIENT_ID,
    clientSecret: env.CAFE24_CLIENT_SECRET,
    tokenStore,
  });

  try {
    const tokens = await client.exchangeCodeForToken(code, redirectUri);
    return c.json({
      success: true,
      message: "Cafe24 연동이 완료되었습니다.",
      expiresAt: tokens.accessTokenExpiresAt.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Cafe24 토큰 교환 실패: ${msg}` }, 500);
  }
});

export { cafe24OAuth };
