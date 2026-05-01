import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/env.js";

/**
 * 카카오 스킬 서버 인증 미들웨어
 * x-kakao-skill-key 헤더로 인증
 */
export const kakaoSkillAuth = createMiddleware<AppEnv>(async (c, next) => {
  const configuredKey = c.env.KAKAO_SKILL_KEY;

  // 키가 설정되지 않으면 인증 스킵 (카카오 어드민에서 스킬 키 미설정 시)
  if (!configuredKey) {
    return next();
  }

  const skillKey = c.req.header("x-kakao-skill-key");
  if (!skillKey || skillKey !== configuredKey) {
    return c.json({ error: "Unauthorized: Invalid skill key" }, 401);
  }

  await next();
});
