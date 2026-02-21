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
  getCustomerLink,
  upsertCustomerLink,
  getPopularQuestions,
} from "@kb-chatbot/kb-engine";
import { conversations, blockedTerms } from "@kb-chatbot/database";
import { and, gte, eq, count } from "drizzle-orm";
import { kakaoSkillAuth } from "../middleware/kakao-auth.js";
import {
  buildAnswerResponse,
  buildFallbackResponse,
  buildFeedbackThanksResponse,
  buildAgentTransferResponse,
  buildKakaoSyncPromptResponse,
  buildOrderListResponse,
  buildLinkingInProgressResponse,
  buildBlockedResponse,
  buildRateLimitResponse,
} from "../lib/kakao-response.js";
import { Cafe24Client, getOrderStatusLabel } from "../lib/cafe24-client.js";
import { DbTokenStore } from "../lib/cafe24-token-store.js";
import { detectIntent } from "../lib/intent-detector.js";

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
  const props = body.userRequest.user.properties;
  const kakaoUserId =
    props?.appUserId ||
    props?.plusfriendUserKey ||
    body.userRequest.user.id;

  const db = c.get("db");

  // ── 차단 용어 필터링 ──

  const blocked = await checkBlockedTerms(db, utterance);
  if (blocked) {
    return c.json(buildBlockedResponse());
  }

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

  // ── 속도 제한 체크 ──

  const rateLimited = await checkRateLimit(db, kakaoUserId);
  if (rateLimited) {
    return c.json(buildRateLimitResponse());
  }

  // ── 주문/배송 의도 감지 ──

  const intent = detectIntent(utterance);

  if (intent === "shipping_inquiry" || intent === "order_inquiry") {
    const orderResponse = await handleOrderIntent(c, db, kakaoUserId, utterance);
    if (orderResponse) {
      return c.json(orderResponse);
    }
    // Cafe24 미설정 등으로 주문 조회 불가 → 일반 KB 파이프라인으로 fallthrough
  }

  // ── 답변 파이프라인 실행 (일반 질문) ──

  const result = await answerPipeline(utterance, {
    db,
    openaiApiKey: c.env.OPENAI_API_KEY,
  });

  let response;
  if (result.source === "fallback") {
    response = buildFallbackResponse();
  } else {
    // 인기 질문 조회 (답변 성공 시에만)
    let popularQuestions: Array<{ question: string }> = [];
    try {
      popularQuestions = await getPopularQuestions(db, 5);
    } catch (err) {
      console.error("Failed to fetch popular questions:", err);
    }
    response = buildAnswerResponse(result.answer, result.imageUrl, popularQuestions);
  }

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

/**
 * GET /kakao/sync/callback
 * 카카오싱크 동의 후 콜백
 *
 * Flow:
 * 1. Kakao OAuth code 수신
 * 2. 코드 → 토큰 교환 → 사용자 정보 조회 (전화번호)
 * 3. 전화번호 정규화 + customer_links에 저장
 * 4. Cafe24 고객 검색 시도 → 매칭 시 cafe24_customer_id 저장
 */
kakao.get("/sync/callback", async (c) => {
  const code = c.req.query("code");
  const kakaoUserId = c.req.query("state");

  if (!code || !kakaoUserId) {
    return c.html("<h2>인증에 실패했습니다. 다시 시도해주세요.</h2>");
  }

  const db = c.get("db");
  const env = c.env;

  try {
    // 1. 코드 → 토큰 교환
    const callbackUrl = new URL(c.req.url);
    callbackUrl.search = "";

    const tokenResp = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.KAKAO_REST_API_KEY,
        redirect_uri: callbackUrl.toString(),
        code,
      }).toString(),
    });

    if (!tokenResp.ok) {
      throw new Error(`Kakao token exchange failed: ${tokenResp.status}`);
    }

    const tokenData = (await tokenResp.json()) as { access_token: string };

    // 2. 사용자 정보 조회 (전화번호)
    const userResp = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResp.ok) {
      throw new Error(`Kakao user info failed: ${userResp.status}`);
    }

    const userData = (await userResp.json()) as {
      kakao_account?: {
        phone_number?: string;
      };
    };

    const rawPhone = userData.kakao_account?.phone_number;
    if (!rawPhone) {
      return c.html("<h2>전화번호 정보를 가져올 수 없습니다. 동의 항목을 확인해주세요.</h2>");
    }

    // 3. 전화번호 정규화: "+82 010-1234-5678" → "01012345678"
    const phoneNumber = normalizePhoneNumber(rawPhone);

    // 4. Cafe24 고객 검색 시도
    let cafe24CustomerId: string | null = null;
    let cafe24MemberId: string | null = null;

    if (env.CAFE24_MALL_ID && env.CAFE24_CLIENT_ID && env.CAFE24_CLIENT_SECRET) {
      try {
        const tokenStore = new DbTokenStore(db);
        const cafe24Client = new Cafe24Client({
          mallId: env.CAFE24_MALL_ID,
          clientId: env.CAFE24_CLIENT_ID,
          clientSecret: env.CAFE24_CLIENT_SECRET,
          tokenStore,
        });

        const customer = await cafe24Client.searchCustomerByPhone(phoneNumber);
        if (customer) {
          cafe24CustomerId = customer.member_id;
          cafe24MemberId = customer.member_id;
        }
      } catch (err) {
        console.error("Cafe24 customer search failed:", err);
      }
    }

    // 5. customer_links에 저장
    await upsertCustomerLink(db, {
      kakaoUserId,
      phoneNumber,
      cafe24CustomerId,
      cafe24MemberId,
      linkedAt: cafe24CustomerId ? new Date() : null,
    });

    const statusMsg = cafe24CustomerId
      ? "인증이 완료되었습니다! 이제 주문/배송 조회가 가능합니다."
      : "전화번호가 등록되었습니다. 쇼핑몰 계정 매칭은 추후 진행됩니다.";

    return c.html(`<h2>${statusMsg}</h2><p>이 창을 닫고 카카오톡으로 돌아가주세요.</p>`);
  } catch (err) {
    console.error("KakaoSync callback error:", err);
    return c.html("<h2>인증 처리 중 오류가 발생했습니다. 다시 시도해주세요.</h2>");
  }
});

/**
 * 주문/배송 의도 처리
 *
 * 1. customer_links 확인
 * 2. 미등록 → 카카오싱크 인증 요청
 * 3. 전화번호 있지만 Cafe24 미매칭 → 매칭 시도
 * 4. 완전 연결 → 주문 목록 조회
 */
async function handleOrderIntent(
  c: {
    env: { CAFE24_MALL_ID: string; CAFE24_CLIENT_ID: string; CAFE24_CLIENT_SECRET: string; KAKAO_REST_API_KEY: string };
    req: { url: string };
  },
  db: Parameters<typeof getCustomerLink>[0],
  kakaoUserId: string,
  _utterance: string,
): Promise<ReturnType<typeof buildOrderListResponse> | null> {
  const env = c.env;

  // Cafe24 연동이 안 되어 있으면 null 반환 (일반 KB로 fallthrough)
  if (!env.CAFE24_MALL_ID || !env.CAFE24_CLIENT_ID || !env.CAFE24_CLIENT_SECRET) {
    return null;
  }

  const link = await getCustomerLink(db, kakaoUserId);

  // 1. 미등록 → 카카오싱크 인증 요청
  if (!link || !link.phoneNumber) {
    if (!env.KAKAO_REST_API_KEY) return null;

    const callbackUrl = new URL(c.req.url);
    callbackUrl.pathname = "/kakao/sync/callback";
    callbackUrl.search = "";

    const consentUrl =
      `https://kauth.kakao.com/oauth/authorize` +
      `?client_id=${env.KAKAO_REST_API_KEY}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl.toString())}` +
      `&response_type=code` +
      `&scope=phone_number` +
      `&state=${encodeURIComponent(kakaoUserId)}`;

    return buildKakaoSyncPromptResponse(consentUrl);
  }

  const tokenStore = new DbTokenStore(db);
  const cafe24Client = new Cafe24Client({
    mallId: env.CAFE24_MALL_ID,
    clientId: env.CAFE24_CLIENT_ID,
    clientSecret: env.CAFE24_CLIENT_SECRET,
    tokenStore,
  });

  // 2. 전화번호 있지만 Cafe24 미매칭 → 매칭 시도
  let memberId = link.cafe24MemberId;

  if (!memberId) {
    try {
      const customer = await cafe24Client.searchCustomerByPhone(link.phoneNumber);
      if (customer) {
        memberId = customer.member_id;
        await upsertCustomerLink(db, {
          kakaoUserId,
          cafe24CustomerId: customer.member_id,
          cafe24MemberId: customer.member_id,
          linkedAt: new Date(),
        });
      }
    } catch (err) {
      console.error("Cafe24 customer search failed:", err);
    }

    if (!memberId) {
      return buildLinkingInProgressResponse();
    }
  }

  // 3. 완전 연결 → 주문 목록 조회
  try {
    const orders = await cafe24Client.getOrdersByMemberId(memberId, 5);

    const orderItems = orders.flatMap((order) =>
      order.items.map((item) => ({
        productName: item.product_name,
        statusLabel: getOrderStatusLabel(item.order_status),
        trackingNo: item.tracking_no,
      })),
    );

    return buildOrderListResponse(orderItems.slice(0, 5));
  } catch (err) {
    console.error("Cafe24 order query failed:", err);
    return null; // fallthrough to KB
  }
}

/**
 * 차단 용어 체크
 *
 * blockedTerms 테이블에서 모든 패턴을 로드하고,
 * matchType에 따라 utterance를 검사한다.
 *
 * @returns true if the utterance matches a blocked term
 */
async function checkBlockedTerms(
  db: Parameters<typeof getCustomerLink>[0],
  utterance: string,
): Promise<boolean> {
  const terms = await db.select().from(blockedTerms);
  const lowerUtterance = utterance.toLowerCase();

  for (const term of terms) {
    const pattern = term.pattern;
    switch (term.matchType) {
      case "contains":
        if (lowerUtterance.includes(pattern.toLowerCase())) return true;
        break;
      case "exact":
        if (lowerUtterance === pattern.toLowerCase()) return true;
        break;
      case "regex":
        try {
          if (new RegExp(pattern, "i").test(utterance)) return true;
        } catch {
          // invalid regex pattern — skip
          console.warn(`Invalid blocked term regex: ${pattern}`);
        }
        break;
    }
  }
  return false;
}

/**
 * 속도 제한 체크
 *
 * conversations 테이블에서 해당 kakaoUserId의 최근 메시지 수를 확인.
 * - 1시간 내 30건 초과 → 차단
 * - 24시간 내 100건 초과 → 차단
 *
 * @returns true if rate limit is exceeded
 */
async function checkRateLimit(
  db: Parameters<typeof getCustomerLink>[0],
  kakaoUserId: string,
): Promise<boolean> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

  // 1시간 내 메시지 수
  const [hourResult] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.kakaoUserId, kakaoUserId),
        gte(conversations.createdAt, hourAgo),
      ),
    );

  if (hourResult && hourResult.value >= 30) {
    return true;
  }

  // 24시간 내 메시지 수
  const [dayResult] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.kakaoUserId, kakaoUserId),
        gte(conversations.createdAt, dayAgo),
      ),
    );

  if (dayResult && dayResult.value >= 100) {
    return true;
  }

  return false;
}

/**
 * 전화번호 정규화
 * "+82 010-1234-5678" → "01012345678"
 * "010-1234-5678" → "01012345678"
 */
function normalizePhoneNumber(raw: string): string {
  // +82 제거 후 숫자만 추출
  let phone = raw.replace(/\+82\s*/, "0");
  phone = phone.replace(/[^0-9]/g, "");
  // 82로 시작하면 0으로 교체
  if (phone.startsWith("82")) {
    phone = "0" + phone.slice(2);
  }
  return phone;
}

/**
 * 한국 휴대폰 번호 패턴 감지 및 정규화
 * "010-1234-5678", "01012345678", "010 1234 5678" → "01012345678"
 * 유효하지 않으면 null 반환
 */
function parsePhoneNumber(text: string): string | null {
  const digits = text.replace(/[\-\s]/g, "").replace(/[^0-9]/g, "");
  if (/^01[016789]\d{7,8}$/.test(digits)) {
    return digits;
  }
  return null;
}

export { kakao };
