# Phase A: 운영 기능 강화 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 대시보드 통계 강화, 미답변 질문 KB 보강, 고객별 대화 이력, FAQ 버튼 추천 — 4개 독립 기능 구현

**Architecture:** 각 기능이 독립 모듈 (Workers API 엔드포인트 + 대시보드 페이지). 기존 DB 테이블과 kb-engine 함수를 활용하며, 새 테이블 생성 없이 기존 `conversations`, `knowledge_items` 테이블의 쿼리만 추가.

**Tech Stack:** Hono (Workers API), Next.js 15 (Dashboard), Drizzle ORM (DB), recharts (차트), TypeScript

---

## Task 1: 대시보드 통계 페이지 강화 (#35)

대시보드 홈에 이미 기본 통계 카드 + RAG 차트가 있음. 여기에 **자주 묻는 질문 TOP 10**과 **기간 선택** 기능을 추가한다.

**Files:**
- Modify: `packages/kb-engine/src/stats.ts` — `getTopQuestions()` 함수 추가
- Modify: `packages/kb-engine/src/index.ts` — export 추가
- Modify: `apps/workers/src/routes/stats.ts` — `/api/stats/top-questions` 엔드포인트
- Modify: `apps/dashboard/src/lib/api.ts` — API 함수 추가
- Modify: `apps/dashboard/src/app/page.tsx` — TOP 질문 섹션 + 기간 선택 추가

**Step 1: kb-engine에 getTopQuestions 추가**

`packages/kb-engine/src/stats.ts`에 추가:

```typescript
export interface TopQuestion {
  id: string;
  question: string;
  category: string | null;
  matchCount: number;
}

/**
 * 가장 많이 매칭된 KB 항목 TOP N
 */
export async function getTopQuestions(
  db: Database,
  limit: number = 10,
  days: number = 30,
): Promise<TopQuestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      category: knowledgeItems.category,
      matchCount: count(),
    })
    .from(conversations)
    .innerJoin(
      knowledgeItems,
      sql`${conversations.matchedKbId} = ${knowledgeItems.id}`,
    )
    .where(
      and(
        isNotNull(conversations.matchedKbId),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(knowledgeItems.id, knowledgeItems.question, knowledgeItems.category)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return results;
}
```

`packages/kb-engine/src/index.ts`에 export 추가:
```typescript
export { getTopQuestions, type TopQuestion } from "./stats.js";
```

**Step 2: getConversationStats와 getRAGStats에 days 파라미터 추가**

`getRAGStats`에 이미 7일 하드코딩되어 있으므로 `days` 파라미터를 받도록 수정:

```typescript
export async function getRAGStats(db: Database, days: number = 7): Promise<RAGStats> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  // ... 이하 동일
}
```

**Step 3: Workers API 엔드포인트**

`apps/workers/src/routes/stats.ts`에 추가:

```typescript
import { getDashboardStats, getRAGStats, getTopQuestions } from "@kb-chatbot/kb-engine";

// GET /api/stats/top-questions?days=30&limit=10
stats.get("/top-questions", async (c) => {
  const db = c.get("db");
  const days = Number(c.req.query("days") || "30");
  const limit = Number(c.req.query("limit") || "10");
  const result = await getTopQuestions(db, limit, days);
  return c.json({ data: result });
});

// 기존 /api/stats/rag 에 days 파라미터 추가
stats.get("/rag", async (c) => {
  const db = c.get("db");
  const days = Number(c.req.query("days") || "7");
  const result = await getRAGStats(db, days);
  return c.json(result);
});
```

**Step 4: Dashboard API 클라이언트**

`apps/dashboard/src/lib/api.ts`에 추가:

```typescript
export interface TopQuestion {
  id: string;
  question: string;
  category: string | null;
  matchCount: number;
}

// api 객체에 추가
getTopQuestions: (days = 30, limit = 10) =>
  apiClient<{ data: TopQuestion[] }>(`/api/stats/top-questions?days=${days}&limit=${limit}`),
```

**Step 5: 대시보드 홈 페이지에 TOP 질문 + 기간 선택 추가**

`apps/dashboard/src/app/page.tsx` — 기존 RAG 섹션 아래에 추가:

- 기간 선택 버튼 (7일/30일/90일) — `useState`로 관리, RAG stats와 top questions 모두에 적용
- TOP 질문 테이블: 순위, 질문, 카테고리, 매칭 횟수

**Step 6: 빌드 및 배포 확인**

```bash
npx turbo build --filter=@kb-chatbot/kb-engine --filter=@kb-chatbot/shared
npx wrangler deploy
```

**Step 7: 커밋**

```bash
git add packages/kb-engine/src/stats.ts packages/kb-engine/src/index.ts \
  apps/workers/src/routes/stats.ts apps/dashboard/src/lib/api.ts \
  apps/dashboard/src/app/page.tsx
git commit -m "feat: add top questions stats and period selector to dashboard"
```

---

## Task 2: 미답변 질문 수집 → KB 보강 (#36)

봇이 답변 실패한 질문(fallback)을 모아서 보여주고, 답변을 작성하면 바로 KB에 등록한다.

**Files:**
- Modify: `packages/kb-engine/src/stats.ts` — `getUnansweredQuestions()` 함수 추가
- Modify: `packages/kb-engine/src/index.ts` — export 추가
- Modify: `apps/workers/src/routes/stats.ts` — `/api/stats/unanswered` 엔드포인트
- Modify: `apps/dashboard/src/lib/api.ts` — API 함수 추가
- Create: `apps/dashboard/src/app/kb/unanswered/page.tsx` — 미답변 질문 페이지
- Modify: `apps/dashboard/src/components/layout/sidebar.tsx` — 메뉴 추가

**Step 1: kb-engine에 getUnansweredQuestions 추가**

`packages/kb-engine/src/stats.ts`에 추가:

```typescript
export interface UnansweredQuestion {
  userMessage: string;
  count: number;
  lastAsked: string;
  sampleResponses: string[];
}

/**
 * 미답변(fallback) 질문 목록 — 유사 질문 그룹핑 (단순 exact match)
 */
export async function getUnansweredQuestions(
  db: Database,
  days: number = 30,
  limit: number = 50,
): Promise<UnansweredQuestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await db
    .select({
      userMessage: conversations.userMessage,
      count: count(),
      lastAsked: sql<string>`MAX(${conversations.createdAt})`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.responseSource, "fallback"),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(conversations.userMessage)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return results.map((r) => ({
    userMessage: r.userMessage,
    count: r.count,
    lastAsked: r.lastAsked,
    sampleResponses: [],
  }));
}
```

**Step 2: Workers API 엔드포인트**

`apps/workers/src/routes/stats.ts`에 추가:

```typescript
// GET /api/stats/unanswered?days=30
stats.get("/unanswered", async (c) => {
  const db = c.get("db");
  const days = Number(c.req.query("days") || "30");
  const result = await getUnansweredQuestions(db, days);
  return c.json({ data: result });
});
```

**Step 3: Dashboard API 클라이언트**

`apps/dashboard/src/lib/api.ts`에 추가:

```typescript
export interface UnansweredQuestion {
  userMessage: string;
  count: number;
  lastAsked: string;
}

getUnansweredQuestions: (days = 30) =>
  apiClient<{ data: UnansweredQuestion[] }>(`/api/stats/unanswered?days=${days}`),
```

**Step 4: 미답변 질문 페이지 생성**

`apps/dashboard/src/app/kb/unanswered/page.tsx`:

핵심 UI:
- 미답변 질문 테이블 (질문, 빈도, 마지막 문의일)
- 각 행에 "KB 등록" 버튼
- 버튼 클릭 → 인라인 폼 (질문 프리필, 답변 입력, 카테고리 선택)
- 저장 → `api.createKB({ question, answer, category, status: "published" })` 호출
- 저장 후 목록에서 제거

**Step 5: 사이드바에 메뉴 추가**

`apps/dashboard/src/components/layout/sidebar.tsx` navItems에 추가:

```typescript
{ href: "/kb/unanswered", label: "미답변 질문", icon: AlertCircle },
```

(`lucide-react`의 `AlertCircle` import 추가)

**Step 6: 빌드, 배포, 커밋**

```bash
npx turbo build && npx wrangler deploy
git add packages/kb-engine/src/stats.ts packages/kb-engine/src/index.ts \
  apps/workers/src/routes/stats.ts apps/dashboard/src/lib/api.ts \
  apps/dashboard/src/app/kb/unanswered/page.tsx \
  apps/dashboard/src/components/layout/sidebar.tsx
git commit -m "feat: add unanswered questions collection with KB registration"
```

---

## Task 3: 고객별 대화 이력 (#38)

카카오 사용자 ID 기준으로 해당 고객의 전체 대화를 타임라인으로 조회한다.

**Files:**
- Create: `apps/dashboard/src/app/customers/[id]/page.tsx` — 고객 상세 (대화 타임라인)
- Modify: `apps/dashboard/src/app/conversations/page.tsx` — 사용자 ID 링크 추가
- Modify: `apps/dashboard/src/lib/api.ts` — 타입 확인 (이미 `kakaoUserId` 필터 지원)

**Step 1: 고객 상세 페이지 생성**

`apps/dashboard/src/app/customers/[id]/page.tsx`:

- URL: `/customers/{kakaoUserId}`
- `api.listConversations({ kakaoUserId })` 호출 (이미 지원됨)
- 타임라인 UI: 날짜별 그룹핑, 각 대화에 질문/답변/소스 배지 표시
- 소스별 색상: kb_match=green, ai_generated=blue, fallback=amber
- 상단에 고객 요약: 총 대화 수, 첫 문의일, 마지막 문의일

**Step 2: 대화 로그 페이지에 사용자 링크 추가**

`apps/dashboard/src/app/conversations/page.tsx`:

- 테이블의 `kakaoUserId` 컬럼을 클릭 가능한 링크로 변경
- `<Link href={/customers/${conv.kakaoUserId}}>` 사용
- 같은 사용자의 대화 수를 배지로 표시

**Step 3: 빌드, 배포, 커밋**

```bash
git add apps/dashboard/src/app/customers/\\[id\\]/page.tsx \
  apps/dashboard/src/app/conversations/page.tsx
git commit -m "feat: add customer conversation timeline page"
```

---

## Task 4: FAQ 버튼 추천 (신규)

답변 후 자주 묻는 질문 버튼을 카카오톡 quickReplies로 표시한다.

**Files:**
- Modify: `packages/kb-engine/src/stats.ts` — `getPopularQuestions()` 함수 추가
- Modify: `packages/kb-engine/src/index.ts` — export 추가
- Modify: `apps/workers/src/lib/kakao-response.ts` — `buildAnswerResponse`에 quickReplies 추가
- Modify: `apps/workers/src/routes/kakao.ts` — 인기 질문 조회 후 응답에 포함

**Step 1: kb-engine에 getPopularQuestions 추가**

`packages/kb-engine/src/stats.ts`에 추가:

```typescript
export interface PopularQuestion {
  question: string;
}

/**
 * 최근 30일 가장 많이 매칭된 KB 질문 (quickReply용, 짧은 것만)
 */
export async function getPopularQuestions(
  db: Database,
  limit: number = 5,
): Promise<PopularQuestion[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const results = await db
    .select({
      question: knowledgeItems.question,
      matchCount: count(),
    })
    .from(conversations)
    .innerJoin(
      knowledgeItems,
      sql`${conversations.matchedKbId} = ${knowledgeItems.id}`,
    )
    .where(
      and(
        isNotNull(conversations.matchedKbId),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(knowledgeItems.id, knowledgeItems.question)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  // quickReply label은 14자 제한이므로 긴 질문은 자름
  return results.map((r) => ({
    question: r.question.length > 14 ? r.question.slice(0, 13) + "…" : r.question,
  }));
}
```

**Step 2: 카카오 응답에 quickReplies 추가**

`apps/workers/src/lib/kakao-response.ts`에서 `buildAnswerResponse` 수정:

```typescript
export function buildAnswerResponse(
  answerText: string,
  imageUrl?: string | null,
  faqButtons?: Array<{ question: string }>,
): KakaoSkillResponse {
  // ... 기존 outputs 로직 유지

  // quickReplies: 기존 피드백 + FAQ 버튼
  const quickReplies: KakaoQuickReply[] = [
    { messageText: "도움이 됐어요", label: "도움이 됐어요", action: "message" },
    { messageText: "상담사 연결", label: "상담사 연결", action: "message" },
  ];

  if (faqButtons && faqButtons.length > 0) {
    for (const faq of faqButtons.slice(0, 5)) {
      quickReplies.push({
        messageText: faq.question,
        label: faq.question,
        action: "message",
      });
    }
  }

  return {
    version: "2.0",
    template: { outputs, quickReplies },
  };
}
```

**Step 3: kakao.ts에서 인기 질문 조회 후 전달**

`apps/workers/src/routes/kakao.ts` — answerPipeline 호출 후:

```typescript
// 인기 질문 조회 (캐시 없이 매번 — 데이터가 적으므로 부담 없음)
const popularQuestions = await getPopularQuestions(db, 5);

// 응답 빌드 시 faqButtons 전달
const response = buildAnswerResponse(
  pipelineResult.answer,
  pipelineResult.imageUrl,
  popularQuestions,
);
```

**Step 4: 빌드, 배포, 테스트**

```bash
npx turbo build && npx wrangler deploy
# 테스트: 질문 후 quickReplies에 FAQ 버튼이 포함되는지 확인
curl -s -X POST https://kb-chatbot-api.gopeace88.workers.dev/kakao/skill \
  -H "Content-Type: application/json" \
  -H "x-kakao-skill-key: kb-chatbot-test-key-2026" \
  -d '...' | jq '.template.quickReplies'
```

**Step 5: 커밋**

```bash
git add packages/kb-engine/src/stats.ts packages/kb-engine/src/index.ts \
  apps/workers/src/lib/kakao-response.ts apps/workers/src/routes/kakao.ts
git commit -m "feat: add FAQ quick reply buttons to kakao responses"
```

---

## 구현 순서 요약

| 순서 | Task | 예상 변경 파일 | 핵심 |
|------|------|---------------|------|
| 1 | 통계 강화 | 5개 수정 | TOP 질문 + 기간 선택 |
| 2 | 미답변 KB 보강 | 5개 수정 + 1개 생성 | fallback 수집 + 원클릭 등록 |
| 3 | 고객 대화 이력 | 1개 생성 + 1개 수정 | 사용자 ID별 타임라인 |
| 4 | FAQ 버튼 추천 | 4개 수정 | quickReplies로 인기 질문 표시 |

## 검증 방법

각 Task 완료 후:
1. `npx turbo build` — 빌드 성공 확인
2. `npx wrangler deploy` — Workers 배포
3. API 엔드포인트 curl 테스트
4. 대시보드 localhost:3000 에서 UI 확인
5. Task 4는 카카오 스킬 API로 quickReplies 포함 응답 확인
