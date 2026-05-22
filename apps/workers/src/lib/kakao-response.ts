import type {
  KakaoSkillResponse,
  KakaoOutput,
  KakaoQuickReply,
} from "@kb-chatbot/shared";
import { KAKAO_LIMITS } from "@kb-chatbot/shared";

const AGENT_TRANSFER_THUMBNAIL_URL =
  "https://pub-27d0617b23e74b94af0239ab047e6ab4.r2.dev/kakao/runvision-agent-transfer-simple.png";

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

function normalizeImageUrl(imageUrl: string): string {
  try {
    return encodeURI(imageUrl);
  } catch {
    return imageUrl;
  }
}

/**
 * KB 매칭 또는 AI 생성 답변 응답
 */
export function buildAnswerResponse(
  answerText: string,
  imageUrl?: string | null,
  faqButtons?: Array<{ question: string }>,
): KakaoSkillResponse {
  const outputs: KakaoOutput[] = [];

  if (imageUrl) {
    // simpleImage + simpleText 분리: 이미지 탭 시 카카오톡 전체 화면 뷰 지원
    outputs.push({
      simpleImage: {
        imageUrl: normalizeImageUrl(imageUrl),
        altText: "제품 이미지",
      },
    });
    outputs.push(simpleText(answerText));
  } else {
    outputs.push(simpleText(answerText));
  }

  const quickReplies: KakaoQuickReply[] = feedbackQuickReplies();

  if (faqButtons && faqButtons.length > 0) {
    for (const faq of faqButtons.slice(0, 5)) {
      const label = faq.question.length > 14
        ? faq.question.slice(0, 13) + "…"
        : faq.question;
      quickReplies.push({
        action: "message",
        label,
        messageText: faq.question,
      });
    }
  }

  return {
    version: "2.0",
    template: {
      outputs,
      quickReplies,
    },
  };
}

/**
 * 애매한 KB 매칭 시 후보 질문 선택 응답
 */
export function buildClarifyResponse(
  candidates: Array<{ question: string }>,
): KakaoSkillResponse {
  const quickReplies: KakaoQuickReply[] = candidates.slice(0, 3).map((candidate) => {
    const label = candidate.question.length > 14
      ? candidate.question.slice(0, 13) + "…"
      : candidate.question;

    return {
      action: "message",
      label,
      messageText: candidate.question,
    };
  });

  quickReplies.push({
    action: "message",
    label: "상담사 연결",
    messageText: "상담사 연결",
  });

  return {
    version: "2.0",
    template: {
      outputs: [simpleText("이 중 궁금하신 게 있나요?")],
      quickReplies,
    },
  };
}

/**
 * KB 미스 / 폴백 상담직원 연결 응답
 *
 * 카카오 i 오픈빌더 스킬 응답으로는 자동 상담직원 전환 불가.
 * 오픈빌더 시나리오 빌더에서 이 스킬 블록 다음에 [상담직원 연결]
 * 액션을 체이닝해야 자동 전환됨.
 * 참고: https://i.kakao.com/docs/skill-response-format
 */
export function buildAutoAgentTransferResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          basicCard: {
            description:
              "바로 답변드리기 어려운 질문이에요.\n아래 [상담사 연결] 버튼을 눌러 상담사와 연결한 다음, 문의를 다시 보내주시면 답변드립니다.\n(평일 09:00~18:00)",
            thumbnail: {
              imageUrl: AGENT_TRANSFER_THUMBNAIL_URL,
            },
            buttons: [
              {
                action: "operator",
                label: "상담사 연결",
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * 매칭 실패 / 폴백 응답
 */
export function buildFallbackResponse(): KakaoSkillResponse {
  return buildAutoAgentTransferResponse();
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
 * operator 버튼: 카카오 채널 관리자센터 1:1 채팅으로 실제 전환됨
 */
export function buildAgentTransferResponse(): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          basicCard: {
            description:
              "상담사 연결을 도와드릴게요.\n아래 [상담사 연결] 버튼을 눌러 상담사와 연결한 다음, 문의를 다시 보내주시면 답변드립니다.\n(평일 09:00~18:00)",
            thumbnail: {
              imageUrl: AGENT_TRANSFER_THUMBNAIL_URL,
            },
            buttons: [
              {
                action: "operator",
                label: "상담사 연결",
              },
            ],
          },
        },
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
          "욕설/비속어가 포함된 문의는 자동으로 처리할 수 없습니다.\n표현을 순화해서 다시 입력해 주세요. 상담이 필요하시면 상담사 연결을 눌러주세요.",
        ),
      ],
      quickReplies: [
        {
          action: "message",
          label: "다른 질문하기",
          messageText: "다른 질문하기",
        },
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
