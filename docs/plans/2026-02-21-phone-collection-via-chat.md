# 채팅으로 전화번호 수집 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 카카오 심사 없이, 챗봇에서 직접 전화번호를 물어보고 kakao_user_id와 매핑하여 DB에 저장한다.

**Architecture:**
- 사용자가 "주문 조회" → bot이 전화번호 요청 → 사용자가 전화번호 입력 → DB 저장 → 재방문 시 자동 인식
- 상태 관리: conversation 마지막 bot 메시지가 "전화번호" 요청이었는지 확인하는 방식 (DB conversation 테이블 활용)
- Cafe24 미설정 시에도 동작 (지금은 저장만, 카페24 오픈 후 조회 연결)

**Tech Stack:** Hono (CF Workers), Drizzle ORM, Neon PostgreSQL, 카카오 오픈빌더 스킬 서버

---

## 흐름 정리

```
[주문 조회 의도 감지]
    ↓
customer_links에 kakaoUserId 있나?
    ├─ YES (phoneNumber 있음) → "전화번호 XXX-XXXX-XXXX로 등록되어 있습니다. 카페24 연동 후 주문 조회 가능합니다."
    └─ NO → "전화번호를 알려주세요 (예: 01012345678)"
              ↓ 사용자 다음 메시지
         utterance가 전화번호 패턴?
              ├─ YES → DB 저장 → "등록되었습니다!"
              └─ NO → 일반 KB 파이프라인
```

**전화번호 패턴 감지:** `010-1234-5678`, `01012345678`, `010 1234 5678` 모두 허용

---

### Task 1: 전화번호 파싱 유틸리티 추가

**Files:**
- Modify: `apps/workers/src/routes/kakao.ts` (normalizePhoneNumber 이미 있음, 패턴 감지 추가)

**Step 1: 전화번호 패턴 감지 함수 추가**

`kakao.ts`의 `normalizePhoneNumber` 함수 아래에 추가:

```typescript
/**
 * 한국 휴대폰 번호 패턴 감지 및 정규화
 * "010-1234-5678", "01012345678", "010 1234 5678" → "01012345678"
 * 유효하지 않으면 null 반환
 */
function parsePhoneNumber(text: string): string | null {
  // 숫자와 구분자(-, 공백)만 추출
  const cleaned = text.replace(/[^0-9\-\s]/g, "").trim();
  const digits = cleaned.replace(/[\-\s]/g, "");

  // 한국 휴대폰 번호: 010/011/016/017/018/019 + 7-8자리
  if (/^01[016789]\d{7,8}$/.test(digits)) {
    return digits;
  }
  return null;
}
```

**Step 2: 빌드 확인**
```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot
pnpm --filter workers build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 3: Commit**
```bash
git add apps/workers/src/routes/kakao.ts
git commit -m "feat(kakao): add phone number pattern detector"
```

---

### Task 2: 스킬 핸들러에 전화번호 수집 로직 추가

**Files:**
- Modify: `apps/workers/src/routes/kakao.ts`

**현재 흐름 (POST /kakao/skill):**
```
utterance → checkBlockedTerms → 특수 응답(도움됨/상담사) → detectIntent → answerPipeline
```

**변경할 흐름:**
```
utterance → checkBlockedTerms → 특수 응답 → [전화번호 입력 감지] → detectIntent → answerPipeline
```

**Step 1: 전화번호 수집 핸들러 함수 추가**

`handleOrderIntent` 함수 위에 추가:

```typescript
/**
 * 전화번호 직접 수집 핸들러
 *
 * 두 가지 케이스:
 * 1. 주문 조회 의도 + 전화번호 미등록 → 전화번호 요청 메시지 반환
 * 2. utterance가 전화번호 패턴 + 이전 대화에서 요청했음 → 저장 후 확인 메시지
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
      // 전화번호 요청
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

  // Case 2: utterance가 전화번호 패턴인 경우 → 저장
  const phone = parsePhoneNumber(utterance);
  if (phone) {
    const existing = await getCustomerLink(db, kakaoUserId);
    if (!existing?.phoneNumber) {
      // 새로 저장
      await upsertCustomerLink(db, {
        kakaoUserId,
        phoneNumber: phone,
      });
      return {
        version: "2.0",
        template: {
          outputs: [
            {
              simpleText: {
                text: `전화번호 ${phone.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")}가 등록되었습니다.\n카페24 쇼핑몰 연동 후 주문/배송 조회가 가능합니다.`,
              },
            },
          ],
        },
      };
    }
  }

  return null;
}
```

**Step 2: 스킬 핸들러에 호출 추가**

`kakao.ts`의 POST `/kakao/skill` 핸들러에서 `detectIntent` 바로 다음에 추가:

현재 코드 (약 99~110번째 줄):
```typescript
  const intent = detectIntent(utterance);
  if (intent !== "general") {
    const orderResponse = await handleOrderIntent(c, db, kakaoUserId, utterance);
    if (orderResponse) return c.json(orderResponse);
  }
```

변경 후:
```typescript
  const intent = detectIntent(utterance);

  // 전화번호 직접 수집 (카카오싱크 심사 없이)
  const phoneResponse = await handlePhoneCollection(db, kakaoUserId, utterance, intent);
  if (phoneResponse) return c.json(phoneResponse);

  if (intent !== "general") {
    const orderResponse = await handleOrderIntent(c, db, kakaoUserId, utterance);
    if (orderResponse) return c.json(orderResponse);
  }
```

**Step 3: 빌드 확인**
```bash
pnpm --filter workers build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 4: Commit**
```bash
git add apps/workers/src/routes/kakao.ts
git commit -m "feat(kakao): collect phone number via chat without KakaoSync"
```

---

### Task 3: Workers 배포 및 테스트

**Step 1: 배포**
```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot/apps/workers
pnpm run deploy 2>&1 | tail -5
```
Expected: `Deployed kb-chatbot-api triggers`

**Step 2: 테스트 - 주문 조회 의도 (전화번호 미등록)**

테스트 스크립트로 확인:
```bash
curl -s -X POST https://kb-chatbot-api.gopeace88.workers.dev/kakao/skill \
  -H "Content-Type: application/json" \
  -H "Authorization: KakaoAK kb-chatbot-test-key-2026" \
  -d '{
    "userRequest": {
      "utterance": "주문 조회하고 싶어요",
      "user": { "id": "test-user-phone-collect-001" }
    },
    "bot": { "id": "test" }
  }' | python3 -m json.tool | grep -A 3 "simpleText"
```
Expected: "전화번호를 알려주세요" 메시지

**Step 3: 테스트 - 전화번호 입력**
```bash
curl -s -X POST https://kb-chatbot-api.gopeace88.workers.dev/kakao/skill \
  -H "Content-Type: application/json" \
  -H "Authorization: KakaoAK kb-chatbot-test-key-2026" \
  -d '{
    "userRequest": {
      "utterance": "010-1234-5678",
      "user": { "id": "test-user-phone-collect-001" }
    },
    "bot": { "id": "test" }
  }' | python3 -m json.tool | grep -A 3 "simpleText"
```
Expected: "전화번호 010-1234-5678가 등록되었습니다" 메시지

**Step 4: 테스트 - 재방문 (전화번호 이미 등록)**
```bash
curl -s -X POST https://kb-chatbot-api.gopeace88.workers.dev/kakao/skill \
  -H "Content-Type: application/json" \
  -H "Authorization: KakaoAK kb-chatbot-test-key-2026" \
  -d '{
    "userRequest": {
      "utterance": "주문 조회",
      "user": { "id": "test-user-phone-collect-001" }
    },
    "bot": { "id": "test" }
  }' | python3 -m json.tool | grep -A 3 "simpleText"
```
Expected: "전화번호 XXX-XXXX-XXXX로 등록되어 있습니다" 또는 Cafe24 연동 안내

**Step 5: Push**
```bash
git push origin master
```

---

## 주의사항

- `handlePhoneCollection`은 `handleOrderIntent` **앞에** 위치해야 함
- Cafe24 미설정 상태에서 `handleOrderIntent`는 null 반환하므로, 전화번호 수집은 별도 처리 필요
- 이미 전화번호가 등록된 사용자가 전화번호를 입력하면 덮어쓰지 않음 (existing check)
- `upsertCustomerLink`는 kakao_user_id unique constraint로 upsert 처리됨
