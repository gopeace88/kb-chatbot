import { createMiddleware } from "hono/factory";
import type { Env } from "../lib/env.js";

/**
 * 카카오 스킬 서버 인증 미들웨어
 * x-kakao-skill-key 헤더로 인증
 */
export const kakaoSkillAuth = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const skillKey = c.req.header("x-kakao-skill-key");

    if (!skillKey || skillKey !== c.env.KAKAO_SKILL_KEY) {
      return c.json({ error: "Unauthorized: Invalid skill key" }, 401);
    }

    await next();
  },
);
