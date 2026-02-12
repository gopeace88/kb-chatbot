import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import type { KakaoSkillRequest } from "@kb-chatbot/shared";
import {
  answerPipeline,
  createConversation,
  createInquiry,
  incrementUsageCount,
  getLatestConversation,
  updateConversationFeedback,
} from "@kb-chatbot/kb-engine";
import { kakaoSkillAuth } from "../middleware/kakao-auth.js";
import {
  buildAnswerResponse,
  buildFallbackResponse,
  buildFeedbackThanksResponse,
  buildAgentTransferResponse,
} from "../lib/kakao-response.js";

const kakao = new Hono<AppEnv>();

kakao.use("/*", kakaoSkillAuth);

/**
 * POST /kakao/skill
 * 카카오 오픈빌더 스킬 엔드포인트
 *
 * Flow:
 * 1. utterance, kakaoUserId 추출
 * 2. 특수 명령어 처리 (피드백, 상담사 연결)
 * 3. answerPipeline 실행 (임베딩 → KB 검색 → 답변)
 * 4. 카카오 응답 빌드
 * 5. 대화 로그 + 원본 문의 비동기 저장 (waitUntil)
 */
kakao.post("/skill", async (c) => {
  const body = await c.req.json<KakaoSkillRequest>();

  const utterance = body.userRequest.utterance.trim();
  const kakaoUserId =
    body.userRequest.user.properties.appUserId ||
    body.userRequest.user.properties.plusfriendUserKey ||
    body.userRequest.user.id;

  const db = c.get("db");

  // ── 특수 명령어 처리 ──

  if (utterance === "도움이 됐어요") {
    // 가장 최근 대화의 피드백을 업데이트
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const latest = await getLatestConversation(db, kakaoUserId);
          if (latest) {
            await updateConversationFeedback(db, latest.id, true);
          }
        } catch (err) {
          console.error("Failed to update feedback:", err);
        }
      })(),
    );
    return c.json(buildFeedbackThanksResponse());
  }

  if (utterance === "상담사 연결") {
    return c.json(buildAgentTransferResponse());
  }

  // ── 답변 파이프라인 실행 ──

  const result = await answerPipeline(utterance, {
    db,
    openaiApiKey: c.env.OPENAI_API_KEY,
  });

  const response =
    result.source === "fallback"
      ? buildFallbackResponse()
      : buildAnswerResponse(result.answer);

  // ── 비동기 저장 (응답 반환 후 — CF Workers waitUntil) ──

  c.executionCtx.waitUntil(
    (async () => {
      try {
        await createConversation(db, {
          kakaoUserId,
          userMessage: utterance,
          botResponse: result.answer,
          responseSource: result.source,
          matchedKbId: result.matchedKbId ?? undefined,
          similarityScore: result.similarityScore ?? undefined,
        });

        if (result.matchedKbId) {
          await incrementUsageCount(db, result.matchedKbId);
        }

        await createInquiry(
          db,
          {
            channel: "kakao",
            questionText: utterance,
            answerText: result.answer,
            answeredBy: result.source === "kb_match" ? "KB" : "AI",
          },
          c.env.OPENAI_API_KEY,
        );
      } catch (err) {
        console.error("Failed to save conversation/inquiry:", err);
      }
    })(),
  );

  return c.json(response);
});

export { kakao };
