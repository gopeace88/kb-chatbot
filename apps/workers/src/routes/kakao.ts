import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { kakaoSkillAuth } from "../middleware/kakao-auth.js";

const kakao = new Hono<AppEnv>();

kakao.use("/*", kakaoSkillAuth);

/**
 * POST /kakao/skill
 * 카카오 오픈빌더 스킬 엔드포인트
 * Phase 3에서 전체 구현
 */
kakao.post("/skill", async (c) => {
  // TODO: Phase 3 구현
  return c.json({
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text: "챗봇이 준비 중입니다. 잠시 후 다시 시도해주세요.",
          },
        },
      ],
    },
  });
});

export { kakao };
