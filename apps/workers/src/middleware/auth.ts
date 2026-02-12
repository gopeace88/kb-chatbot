import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/env.js";

/**
 * Cloudflare Access JWT 검증 미들웨어
 * 대시보드 API (/api/*) 에 적용
 *
 * 개발 모드: CF_ACCESS_BYPASS=true 이면 인증 스킵
 */
export const cfAccessAuth = createMiddleware<AppEnv>(async (c, next) => {
  // 개발 모드 바이패스
  if (c.env.CF_ACCESS_BYPASS === "true") {
    c.set("userEmail", "dev@localhost");
    return next();
  }

  // CF Access는 Cf-Access-Jwt-Assertion 헤더로 JWT를 전달
  // 실제 검증은 CF Access가 프록시 레벨에서 처리하므로
  // 여기서는 헤더 존재 여부와 사용자 이메일 추출만 수행
  const jwtAssertion = c.req.header("Cf-Access-Jwt-Assertion");

  if (!jwtAssertion) {
    return c.json({ error: "Unauthorized: CF Access token required" }, 401);
  }

  const userEmail = c.req.header("cf-access-authenticated-user-email");
  if (userEmail) {
    c.set("userEmail", userEmail);
  }

  await next();
});
