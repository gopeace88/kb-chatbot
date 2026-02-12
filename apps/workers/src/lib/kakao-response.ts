import type {
  KakaoSkillResponse,
  KakaoOutput,
  KakaoQuickReply,
} from "@kb-chatbot/shared";
import { KAKAO_LIMITS } from "@kb-chatbot/shared";

/**
 * SimpleText 출력 생성
 */
function simpleText(text: string): KakaoOutput {
  const truncated =
    text.length > KAKAO_LIMITS.SIMPLE_TEXT_MAX_LENGTH
      ? text.slice(0, KAKAO_LIMITS.SIMPLE_TEXT_MAX_LENGTH - 3) + "..."
      : text;
  return { simpleText: { text: truncated } };
}

/**
 * 피드백 QuickReply (도움이 됐어요 / 상담사 연결)
 */
function feedbackQuickReplies(): KakaoQuickReply[] {
  return [
    {
      action: "message",
      label: "도움이 됐어요 👍",
      messageText: "도움이 됐어요",
    },
    {
      action: "message",
      label: "상담사 연결",
      messageText: "상담사 연결",
    },
  ];
}

/**
 * KB 매칭 또는 AI 생성 답변 응답
 */
export function buildAnswerResponse(answerText: string): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [simpleText(answerText)],
      quickReplies: feedbackQuickReplies(),
    },
  };
}

/**
 * 매칭 실패 / 폴백 응답
 */
export function buildFallbackResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        simpleText(
          "죄송합니다, 해당 문의에 대한 정확한 답변을 찾지 못했습니다.\n상담사에게 직접 문의하시겠습니까?",
        ),
      ],
      quickReplies: [
        {
          action: "message",
          label: "상담사 연결",
          messageText: "상담사 연결",
        },
      ],
    },
  };
}

/**
 * 피드백 감사 응답
 */
export function buildFeedbackThanksResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        simpleText(
          "피드백 감사합니다! 더 궁금한 점이 있으시면 편하게 문의해주세요.",
        ),
      ],
    },
  };
}

/**
 * 상담사 연결 안내 응답
 */
export function buildAgentTransferResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        simpleText(
          "상담사에게 연결해드리겠습니다. 잠시만 기다려주세요.\n운영시간: 평일 09:00~18:00",
        ),
      ],
    },
  };
}
