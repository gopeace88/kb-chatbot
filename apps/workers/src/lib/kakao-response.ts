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
export function buildAnswerResponse(
  answerText: string,
  imageUrl?: string | null,
): KakaoSkillResponse {
  const outputs: KakaoOutput[] = [];

  if (imageUrl) {
    // basicCard with image thumbnail + truncated description
    const description =
      answerText.length > KAKAO_LIMITS.BASIC_CARD_MAX_LENGTH
        ? answerText.slice(0, KAKAO_LIMITS.BASIC_CARD_MAX_LENGTH - 3) + "..."
        : answerText;
    outputs.push({
      basicCard: {
        thumbnail: { imageUrl },
        description,
      },
    });
    // Full answer as simpleText if it was truncated
    if (answerText.length > KAKAO_LIMITS.BASIC_CARD_MAX_LENGTH) {
      outputs.push(simpleText(answerText));
    }
  } else {
    outputs.push(simpleText(answerText));
  }

  return {
    version: "2.0",
    template: {
      outputs,
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

/**
 * 카카오싱크 전화번호 인증 요청 응답
 * 주문/배송 조회를 위해 전화번호 인증이 필요할 때 사용
 */
export function buildKakaoSyncPromptResponse(
  consentUrl: string,
): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          basicCard: {
            title: "전화번호 인증 필요",
            description:
              "주문/배송 조회를 위해 전화번호 인증이 필요합니다.\n아래 버튼을 눌러 인증을 완료해주세요.",
            buttons: [
              {
                action: "webLink",
                label: "전화번호 인증하기",
                webLinkUrl: consentUrl,
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * 주문 목록 응답 빌더
 */
export function buildOrderListResponse(
  orders: Array<{
    productName: string;
    statusLabel: string;
    trackingNo?: string | null;
  }>,
): KakaoSkillResponse {
  if (orders.length === 0) {
    return {
      version: "2.0",
      template: {
        outputs: [
          simpleText("최근 주문 내역이 없습니다."),
        ],
      },
    };
  }

  const lines = orders.slice(0, 5).map((order, i) => {
    let line = `${i + 1}. ${order.productName} - ${order.statusLabel}`;
    if (order.trackingNo) {
      line += ` (운송장: ${order.trackingNo})`;
    }
    return line;
  });

  const text = `📦 최근 주문 내역\n\n${lines.join("\n")}`;

  return {
    version: "2.0",
    template: {
      outputs: [simpleText(text)],
      quickReplies: feedbackQuickReplies(),
    },
  };
}

/**
 * 차단 용어 매칭 시 응답
 */
export function buildBlockedResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        simpleText(
          "해당 문의는 처리할 수 없습니다. 제품 관련 문의를 해주세요.",
        ),
      ],
    },
  };
}

/**
 * 속도 제한 초과 시 응답
 */
export function buildRateLimitResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        simpleText(
          "잠시 후 다시 문의해주세요. (1시간 내 문의 횟수 초과)",
        ),
      ],
    },
  };
}

/**
 * Cafe24 연결 중 안내 응답
 */
export function buildLinkingInProgressResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        simpleText(
          "전화번호는 확인되었으나, 쇼핑몰 계정과 매칭되는 고객 정보를 찾지 못했습니다.\n쇼핑몰에 가입하신 전화번호가 맞는지 확인해주세요.",
        ),
      ],
    },
  };
}
