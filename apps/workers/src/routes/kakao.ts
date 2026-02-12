import { Hono } from "hono";
import type { Env } from "../lib/env.js";
import { kakaoSkillAuth } from "../middleware/kakao-auth.js";

const kakao = new Hono<{ Bindings: Env }>();

kakao.use("/*", kakaoSkillAuth);

/**
 * POST /kakao/skill
 * 카카오 오픈빌더 스킬 엔드포인트
 * Phase 3에서 전체 구현
 */
kakao.post("/skill", async (c) => {
  // TODO: Phase 3 구현
  // 1. userRequest.utterance 추출
  // 2. 임베딩 생성
  // 3. KB 벡터 검색
  // 4. 매칭 시 SimpleText 응답
  // 5. 미매칭 시 AI 답변 생성
  // 6. 대화 로그 저장

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
