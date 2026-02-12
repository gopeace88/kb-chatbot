import { createMiddleware } from "hono/factory";
import type { Env } from "../lib/env.js";

/**
 * Cloudflare Access JWT 검증 미들웨어
 * 대시보드 API (/api/*) 에 적용
 */
export const cfAccessAuth = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    // CF Access는 Cf-Access-Jwt-Assertion 헤더로 JWT를 전달
    // 실제 검증은 CF Access가 프록시 레벨에서 처리하므로
    // 여기서는 헤더 존재 여부와 사용자 이메일 추출만 수행
    const jwtAssertion = c.req.header("Cf-Access-Jwt-Assertion");

    if (!jwtAssertion) {
      return c.json({ error: "Unauthorized: CF Access token required" }, 401);
    }

    // CF Access가 검증한 사용자 이메일 (cf-access-authenticated-user-email 헤더)
    const userEmail = c.req.header("cf-access-authenticated-user-email");
    if (userEmail) {
      c.set("userEmail" as never, userEmail);
    }

    await next();
  },
);
