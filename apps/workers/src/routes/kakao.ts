import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import type { KakaoSkillRequest, ResponseSource } from "@kb-chatbot/shared";
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
import { blockedTerms } from "@kb-chatbot/database";
import { kakaoSkillAuth } from "../middleware/kakao-auth.js";
import {
  buildAnswerResponse,
  buildClarifyResponse,
  buildAutoAgentTransferResponse,
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
import { detectIntent, type Intent } from "../lib/intent-detector.js";

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

  // ── 특수 명령어 처리 (DB 불필요, 먼저 처리) ──

  if (utterance === "도움이 됐어요") {
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

  // ── 글로벌 안전망 2.3초 ──
  // NAS 이전 후 DB는 로컬(0~1ms)·skipAiGeneration로 GPT 없음 → 남은 지연은
  // OpenAI 임베딩 호출(~0.7~1.5s, 변동)뿐. 동기 pipeline 800ms는 정상 임베딩을
  // 다 잘라 kb_match를 전부 상담전환시켰음(역효과). 임베딩+검색을 허용하되
  // 총응답을 ~2.3s 이내로 유지(카카오 실채널 허용 범위, 경험검증).
  const GLOBAL_TIMEOUT_MS = 2300;

  // KB 미스 → 상담연결 카드를 실제로 보냄. 저장 텍스트도 실제 발송 내용과 일치시킴.
  const AGENT_TRANSFER_BOT_TEXT =
    "바로 답변드리기 어려운 질문이에요.\n아래 [상담사 연결] 버튼을 눌러 상담사와 연결한 다음, 문의를 다시 보내주시면 답변드립니다.\n(평일 09:00~18:00)";

  type PersistOpts = {
    answered: boolean;
    matchedKbId?: string;
    similarityScore?: number;
    answeredBy?: "KB" | "AI";
  };

  // ── 정확히 한 번만 저장 (성공/타임아웃/에러/콜백 경로 공유 latch) ──
  let persisted = false;
  const doPersist = async (
    botResponse: string,
    responseSource: ResponseSource,
    opts: PersistOpts,
  ): Promise<void> => {
    if (persisted) return;
    persisted = true;
    try {
      await createConversation(db, {
        kakaoUserId,
        userMessage: utterance,
        botResponse,
        responseSource,
        matchedKbId: opts.matchedKbId ?? undefined,
        similarityScore: opts.similarityScore ?? undefined,
      });

      if (opts.matchedKbId) {
        await incrementUsageCount(db, opts.matchedKbId);
      }

      await createInquiry(
        db,
        {
          channel: "kakao",
          questionText: utterance,
          // 답변 성공 → answerText 저장(status: answered)
          // fallback → answerText 생략(status: new = 운영자 미해결 큐)
          answerText: opts.answered ? botResponse : undefined,
          answeredBy: opts.answeredBy,
        },
        c.env.OPENAI_API_KEY,
      );
    } catch (err) {
      console.error("Failed to save conversation/inquiry:", err);
    }
  };
  // 동기 경로: 응답 반환 전 waitUntil 등록
  const persistInteraction = (
    botResponse: string,
    responseSource: ResponseSource,
    opts: PersistOpts,
  ) => {
    c.executionCtx.waitUntil(doPersist(botResponse, responseSource, opts));
  };

  const runFlow = async (
    pipelineTimeoutMs: number,
    persist: (
      botResponse: string,
      responseSource: ResponseSource,
      opts: PersistOpts,
    ) => void,
  ) => {
    try {
      // ── 차단 용어(KV) + 속도 제한(KV) 병렬 체크 — DB 미사용, cold start 없음 ──
      const [blocked, rateLimited] = await Promise.all([
        checkBlockedTerms(c.env.BLOCKED_TERMS_CACHE, db, utterance),
        checkRateLimit(c.env.RATE_LIMIT, kakaoUserId),
      ]);

      if (blocked) return buildBlockedResponse();
      if (rateLimited) return buildRateLimitResponse();

      // ── 주문/배송 의도 감지 ──
      const intent = detectIntent(utterance);

      const phoneResponse = await handlePhoneCollection(db, kakaoUserId, utterance, intent);
      if (phoneResponse) return phoneResponse as ReturnType<typeof buildAutoAgentTransferResponse>;

      if (intent !== "general") {
        const orderResponse = await handleOrderIntent(c, db, kakaoUserId, utterance);
        if (orderResponse) return orderResponse;
      }

      // ── 답변 파이프라인 실행 (타임아웃 모드별 주입: 동기 3800ms / 콜백 15000ms) ──
      const result = await Promise.race([
        answerPipeline(utterance, {
          db,
          openaiApiKey: c.env.OPENAI_API_KEY,
          timeoutMs: pipelineTimeoutMs,
          // KB 미스 시 느린 LLM 동기 호출 안 함 → 즉시 상담연결 (카카오 3초 벽 회피)
          skipAiGeneration: true,
        }),
        new Promise<{ source: "fallback"; answer: string; imageUrl: null; matchedKbId: null; similarityScore: null }>(
          (resolve) => setTimeout(() => resolve({ source: "fallback", answer: "", imageUrl: null, matchedKbId: null, similarityScore: null }), pipelineTimeoutMs)
        ),
      ]);

      if (result.source === "clarify") {
        const botText = result.answer;
        persist(botText, "clarify", {
          answered: false,
          similarityScore: result.similarityScore ?? undefined,
        });
        return buildClarifyResponse(result.clarifyCandidates ?? []);
      }

      if (result.source === "fallback") {
        // KB 미스(또는 파이프라인 실패) → 즉시 상담연결. 운영자 후속/지식보강 위해 미해결 저장.
        persist(AGENT_TRANSFER_BOT_TEXT, "fallback", { answered: false });
        return buildAutoAgentTransferResponse();
      }

      // ── 인기질문: 답변을 막지 않도록 자체 짧은 타임아웃 (Codex Finding 2) ──
      const popularQuestions = await Promise.race([
        getPopularQuestions(db, 5).catch(() => [] as Array<{ question: string }>),
        new Promise<Array<{ question: string }>>((resolve) =>
          setTimeout(() => resolve([]), 500)
        ),
      ]);

      persist(result.answer, result.source, {
        answered: true,
        matchedKbId: result.matchedKbId ?? undefined,
        similarityScore: result.similarityScore ?? undefined,
        answeredBy: result.source === "kb_match" ? "KB" : "AI",
      });

      return buildAnswerResponse(result.answer, result.imageUrl, popularQuestions);
    } catch (err) {
      // 어떤 에러(DB 등)든 새지 않게 — 미해결 저장 후 fallback (Codex Finding 1)
      console.error("kakao /skill runFlow error:", err);
      persist(AGENT_TRANSFER_BOT_TEXT, "fallback", { answered: false });
      return buildAutoAgentTransferResponse();
    }
  };

  // ── 콜백 모드 (카카오 콜백 승인 시 callbackUrl 전달) ──
  // 즉시 ack 후, 백그라운드로 진짜 답을 만들어 콜백 URL로 POST → 카카오 5초 제한 우회.
  // callbackUrl이 없으면(미승인) 아래 동기 경로로 폴백 — 배포해도 무해.
  const callbackUrl = body.userRequest.callbackUrl;
  if (callbackUrl) {
    c.executionCtx.waitUntil(
      (async () => {
        const pending: Array<Promise<void>> = [];
        const collectPersist = (
          botResponse: string,
          responseSource: ResponseSource,
          opts: PersistOpts,
        ) => {
          pending.push(doPersist(botResponse, responseSource, opts));
        };
        // 콜백 URL 유효시간 1분 — 넉넉하지만 안전한 상한
        const resp = await runFlow(15000, collectPersist);
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resp),
        }).catch((err) => console.error("Kakao callback POST failed:", err));
        await Promise.allSettled(pending);
      })(),
    );

    return c.json({
      version: "2.0",
      useCallback: true,
      data: { text: "답변을 준비하고 있어요. 잠시만 기다려 주세요 🙏" },
    });
  }

  // ── 동기 모드 (콜백 미승인): 1.8초 글로벌 타임아웃 ──
  // exact match는 즉시 끝나고, 임베딩+검색은 1.8초까지 허용(정상 ~0.7~1.5s).
  // 그래도 늦으면 상담사 연결로 넘기고 야간 학습이 다음 exact match 후보로 흡수한다.
  // runFlow가 먼저 끝나면 글로벌 타이머 취소 — 정상 응답 경로에 가짜 미해결 기록 방지
  let globalTimer: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    runFlow(1800, persistInteraction).finally(() => {
      if (globalTimer) clearTimeout(globalTimer);
    }),
    new Promise<ReturnType<typeof buildAutoAgentTransferResponse>>((resolve) => {
      globalTimer = setTimeout(() => {
        // 글로벌 타임아웃 — 응답 반환 전에 미해결 저장 등록 (waitUntil 타이밍)
        persistInteraction(AGENT_TRANSFER_BOT_TEXT, "fallback", { answered: false });
        resolve(buildAutoAgentTransferResponse());
      }, GLOBAL_TIMEOUT_MS);
    }),
  ]);

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
 * 전화번호 직접 수집 핸들러 (카카오싱크 심사 없이)
 *
 * Case 1: 주문/배송 의도 + 전화번호 미등록 → 전화번호 요청 메시지 반환
 * Case 2: utterance가 전화번호 패턴 + 미등록 → DB 저장 후 확인 메시지
 */
async function handlePhoneCollection(
  db: Parameters<typeof getCustomerLink>[0],
  kakaoUserId: string,
  utterance: string,
  intent: Intent,
): Promise<object | null> {
  // Case 1: 주문/배송 의도 + 전화번호 미등록
  if (intent === "order_inquiry" || intent === "shipping_inquiry") {
    const link = await getCustomerLink(db, kakaoUserId);
    if (!link?.phoneNumber) {
      return {
        version: "2.0",
        template: {
          outputs: [
            {
              simpleText: {
                text: "주문/배송 조회를 위해 구매 시 사용한 전화번호를 알려주세요.\n\n예) 01012345678",
              },
            },
          ],
        },
      };
    }
  }

  // Case 2: utterance가 전화번호 패턴 → 미등록 시 저장
  const phone = parsePhoneNumber(utterance);
  if (phone) {
    const existing = await getCustomerLink(db, kakaoUserId);
    if (!existing?.phoneNumber) {
      await upsertCustomerLink(db, {
        kakaoUserId,
        phoneNumber: phone,
      });
      const formatted = phone.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
      return {
        version: "2.0",
        template: {
          outputs: [
            {
              simpleText: {
                text: `전화번호 ${formatted}가 등록되었습니다.\n카페24 쇼핑몰 연동 후 주문/배송 조회가 가능합니다.`,
              },
            },
          ],
        },
      };
    }
  }

  return null;
}

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
/**
 * 차단 용어 체크 — KV 캐시 우선, cache miss 시 DB 폴백
 * KV는 cold start 없어 항상 빠름 (< 1ms)
 */
async function checkBlockedTerms(
  kv: KVNamespace,
  db: Parameters<typeof getCustomerLink>[0],
  utterance: string,
): Promise<boolean> {
  type TermRow = { pattern: string; matchType: string };
  let terms: TermRow[];

  try {
    const cached = await kv.get("terms", "json") as TermRow[] | null;
    if (cached) {
      terms = cached;
    } else {
      // cache miss: DB에서 로드 후 KV에 5분 캐시
      terms = await db.select({ pattern: blockedTerms.pattern, matchType: blockedTerms.matchType }).from(blockedTerms);
      await kv.put("terms", JSON.stringify(terms), { expirationTtl: 300 });
    }
  } catch {
    return false; // KV/DB 오류 시 fail-open
  }

  const lowerUtterance = utterance.toLowerCase();
  for (const term of terms) {
    switch (term.matchType) {
      case "contains":
        if (lowerUtterance.includes(term.pattern.toLowerCase())) return true;
        break;
      case "exact":
        if (lowerUtterance === term.pattern.toLowerCase()) return true;
        break;
      case "regex":
        try {
          if (new RegExp(term.pattern, "i").test(utterance)) return true;
        } catch { /* invalid regex — skip */ }
        break;
    }
  }
  return false;
}

/**
 * 속도 제한 체크 — KV 기반, DB 미사용
 * - 1시간 내 30건 초과 → 차단
 * - 24시간 내 100건 초과 → 차단
 * KV 특성상 eventual consistency (동시 요청 시 약간의 오차 허용)
 */
async function checkRateLimit(
  kv: KVNamespace,
  kakaoUserId: string,
): Promise<boolean> {
  const now = Date.now();
  const hourSlot = Math.floor(now / 3_600_000);
  const daySlot = Math.floor(now / 86_400_000);
  const hourKey = `rl:h:${kakaoUserId}:${hourSlot}`;
  const dayKey = `rl:d:${kakaoUserId}:${daySlot}`;

  try {
    const [hourStr, dayStr] = await Promise.all([
      kv.get(hourKey),
      kv.get(dayKey),
    ]);
    const hourCount = parseInt(hourStr ?? "0");
    const dayCount = parseInt(dayStr ?? "0");

    if (hourCount >= 30 || dayCount >= 100) return true;

    // 카운트 증가 (응답 기다리지 않음)
    Promise.all([
      kv.put(hourKey, String(hourCount + 1), { expirationTtl: 7_200 }),
      kv.put(dayKey, String(dayCount + 1), { expirationTtl: 172_800 }),
    ]).catch(() => {});

    return false;
  } catch {
    return false; // KV 오류 시 fail-open
  }
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
