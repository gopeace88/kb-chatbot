# Customer Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 고객 목록·대화 로그·미해결 문의 세 페이지를 customer_links와 JOIN하여 전화번호/Cafe24 연결 정보를 모든 곳에서 일관되게 표시하고, 고객 목록은 conversations 기준으로 전체 사용자를 보여준다.

**Architecture:**
- kb-engine에 `listAllCustomers` (conversations DISTINCT + LEFT JOIN customer_links) 함수 추가
- `listConversations`, `listUnresolvedConversations`에 customer_links LEFT JOIN 추가 → phoneNumber 포함한 응답 반환
- Workers API: `GET /api/customers` → listAllCustomers로 교체
- Dashboard: 세 페이지에 전화번호 컬럼/정보 추가

**Tech Stack:** Hono (CF Workers), Drizzle ORM (raw SQL `db.execute(sql`...`)`), Next.js 15, TypeScript

---

### Task 1: kb-engine — listAllCustomers 함수 추가

**Files:**
- Modify: `packages/kb-engine/src/customer-links.ts`

conversations 테이블의 DISTINCT kakaoUserId를 기준으로, customer_links를 LEFT JOIN해서 전화번호/Cafe24 정보와 대화 통계를 함께 반환.

**Step 1: CustomerSummary 타입 및 listAllCustomers 함수 추가**

`packages/kb-engine/src/customer-links.ts`의 `upsertCustomerLink` 함수 아래에 추가:

```typescript
export interface CustomerSummary {
  kakaoUserId: string;
  phoneNumber: string | null;
  cafe24CustomerId: string | null;
  linkedAt: Date | null;
  customerSince: Date | null;
  conversationCount: number;
  lastConversationAt: Date | null;
}

export async function listAllCustomers(
  db: Database,
  filter: { page?: number; limit?: number } = {},
): Promise<{ data: CustomerSummary[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    db.execute<{
      kakao_user_id: string;
      phone_number: string | null;
      cafe24_customer_id: string | null;
      linked_at: Date | null;
      customer_since: Date | null;
      conversation_count: string;
      last_conversation_at: Date | null;
    }>(sql`
      SELECT
        u.kakao_user_id,
        cl.phone_number,
        cl.cafe24_customer_id,
        cl.linked_at,
        cl.created_at AS customer_since,
        COUNT(c.id) AS conversation_count,
        MAX(c.created_at) AS last_conversation_at
      FROM (SELECT DISTINCT kakao_user_id FROM conversations) u
      LEFT JOIN customer_links cl ON cl.kakao_user_id = u.kakao_user_id
      LEFT JOIN conversations c ON c.kakao_user_id = u.kakao_user_id
      GROUP BY u.kakao_user_id, cl.phone_number, cl.cafe24_customer_id, cl.linked_at, cl.created_at
      ORDER BY MAX(c.created_at) DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(DISTINCT kakao_user_id) AS total FROM conversations
    `),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return {
    data: rows.map((r) => ({
      kakaoUserId: r.kakao_user_id,
      phoneNumber: r.phone_number,
      cafe24CustomerId: r.cafe24_customer_id,
      linkedAt: r.linked_at,
      customerSince: r.customer_since,
      conversationCount: Number(r.conversation_count),
      lastConversationAt: r.last_conversation_at,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
```

**Step 2: index.ts에서 export 추가**

`packages/kb-engine/src/index.ts`에서 customer-links export에 `listAllCustomers`, `CustomerSummary` 추가:
```typescript
export { getCustomerLink, listCustomerLinks, getCustomerStats, upsertCustomerLink, listAllCustomers } from "./customer-links.js";
export type { CustomerLink, CustomerStats, CustomerSummary } from "./customer-links.js";
```

**Step 3: 빌드 확인**
```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot
pnpm --filter @kb-chatbot/kb-engine build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 4: Commit**
```bash
git add packages/kb-engine/src/customer-links.ts packages/kb-engine/src/index.ts
git commit -m "feat(kb-engine): add listAllCustomers with conversation stats"
```

---

### Task 2: kb-engine — listConversations에 phoneNumber 추가

**Files:**
- Modify: `packages/kb-engine/src/crud.ts`

현재 `listConversations`는 conversations 테이블만 SELECT. customer_links LEFT JOIN 추가.

**Step 1: listConversations 함수 수정**

`packages/kb-engine/src/crud.ts`의 `listConversations` 함수(438번째 줄)를 다음으로 교체:

```typescript
export async function listConversations(
  db: Database,
  filter: PaginationParams & { kakaoUserId?: string },
) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;
  const offset = (page - 1) * limit;

  const whereClause = filter.kakaoUserId
    ? sql`WHERE c.kakao_user_id = ${filter.kakaoUserId}`
    : sql``;

  const [items, countRows] = await Promise.all([
    db.execute<{
      id: string;
      kakao_user_id: string;
      user_message: string;
      bot_response: string;
      response_source: string;
      matched_kb_id: string | null;
      similarity_score: number | null;
      was_helpful: boolean | null;
      agent_response: string | null;
      resolved_at: Date | null;
      resolved_by: string | null;
      created_at: Date;
      phone_number: string | null;
      cafe24_customer_id: string | null;
    }>(sql`
      SELECT c.*, cl.phone_number, cl.cafe24_customer_id
      FROM conversations c
      LEFT JOIN customer_links cl ON cl.kakao_user_id = c.kakao_user_id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM conversations c ${whereClause}
    `),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return {
    data: items.map((r) => ({
      id: r.id,
      kakaoUserId: r.kakao_user_id,
      userMessage: r.user_message,
      botResponse: r.bot_response,
      responseSource: r.response_source as "kb_match" | "ai_generated" | "fallback",
      matchedKbId: r.matched_kb_id,
      similarityScore: r.similarity_score,
      wasHelpful: r.was_helpful,
      agentResponse: r.agent_response,
      resolvedAt: r.resolved_at,
      resolvedBy: r.resolved_by,
      createdAt: r.created_at,
      phoneNumber: r.phone_number,
      cafe24CustomerId: r.cafe24_customer_id,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
```

**Step 2: listUnresolvedConversations도 동일하게 수정**

`listUnresolvedConversations` 함수(526번째 줄)를 찾아 내부 쿼리를 교체:

```typescript
export async function listUnresolvedConversations(
  db: Database,
  filter: PaginationParams & { days?: number },
) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;
  const offset = (page - 1) * limit;
  const days = filter.days ?? 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [items, countRows] = await Promise.all([
    db.execute<{
      id: string;
      kakao_user_id: string;
      user_message: string;
      bot_response: string;
      response_source: string;
      matched_kb_id: string | null;
      similarity_score: number | null;
      was_helpful: boolean | null;
      agent_response: string | null;
      resolved_at: Date | null;
      resolved_by: string | null;
      created_at: Date;
      phone_number: string | null;
      cafe24_customer_id: string | null;
    }>(sql`
      SELECT c.*, cl.phone_number, cl.cafe24_customer_id
      FROM conversations c
      LEFT JOIN customer_links cl ON cl.kakao_user_id = c.kakao_user_id
      WHERE c.response_source = 'fallback'
        AND c.resolved_at IS NULL
        AND c.created_at >= ${since}
      ORDER BY c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM conversations c
      WHERE c.response_source = 'fallback'
        AND c.resolved_at IS NULL
        AND c.created_at >= ${since}
    `),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return {
    data: items.map((r) => ({
      id: r.id,
      kakaoUserId: r.kakao_user_id,
      userMessage: r.user_message,
      botResponse: r.bot_response,
      responseSource: r.response_source as "kb_match" | "ai_generated" | "fallback",
      matchedKbId: r.matched_kb_id,
      similarityScore: r.similarity_score,
      wasHelpful: r.was_helpful,
      agentResponse: r.agent_response,
      resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
      resolvedBy: r.resolved_by,
      createdAt: r.created_at,
      phoneNumber: r.phone_number,
      cafe24CustomerId: r.cafe24_customer_id,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
```

**Step 3: 빌드 확인**
```bash
pnpm --filter @kb-chatbot/kb-engine build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 4: Commit**
```bash
git add packages/kb-engine/src/crud.ts
git commit -m "feat(kb-engine): enrich conversations with phone and cafe24 info"
```

---

### Task 3: Workers API — /api/customers를 listAllCustomers로 교체

**Files:**
- Modify: `apps/workers/src/routes/customers.ts`

**Step 1: import 수정 + GET / 라우트 교체**

`apps/workers/src/routes/customers.ts`:

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";
import { listAllCustomers, getCustomerStats, getCustomerLink } from "@kb-chatbot/kb-engine";

const customers = new Hono<AppEnv>();

// GET /api/customers — 전체 고객 목록 (conversations 기반)
customers.get("/", async (c) => {
  const db = c.get("db");
  const page = Number(c.req.query("page") || "1");
  const limit = Number(c.req.query("limit") || "20");
  const result = await listAllCustomers(db, { page, limit });
  return c.json(result);
});

// GET /api/customers/stats — 고객 통계
customers.get("/stats", async (c) => {
  const db = c.get("db");
  const result = await getCustomerStats(db);
  return c.json(result);
});

// GET /api/customers/:kakaoUserId — 개별 고객 조회
customers.get("/:kakaoUserId", async (c) => {
  const db = c.get("db");
  const kakaoUserId = c.req.param("kakaoUserId");
  const customer = await getCustomerLink(db, kakaoUserId);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json(customer);
});

export { customers };
```

**Step 2: workers 빌드 확인**
```bash
pnpm --filter workers build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 3: Commit**
```bash
git add apps/workers/src/routes/customers.ts
git commit -m "feat(api): replace listCustomerLinks with listAllCustomers for customer list"
```

---

### Task 4: Dashboard — api.ts 타입/함수 업데이트

**Files:**
- Modify: `apps/dashboard/src/lib/api.ts`

**Step 1: CustomerSummary 타입 추가 + listCustomers 반환 타입 변경 + Conversation에 phoneNumber 추가**

`api.ts`에서:

1. `CustomerLink` 인터페이스 아래에 `CustomerSummary` 추가:
```typescript
export interface CustomerSummary {
  kakaoUserId: string;
  phoneNumber: string | null;
  cafe24CustomerId: string | null;
  linkedAt: string | null;
  customerSince: string | null;
  conversationCount: number;
  lastConversationAt: string | null;
}
```

2. `Conversation` 인터페이스에 필드 추가:
```typescript
export interface Conversation {
  // ... 기존 필드들 ...
  phoneNumber: string | null;       // 추가
  cafe24CustomerId: string | null;  // 추가
}
```

3. `listCustomers` 함수 반환 타입 변경:
```typescript
listCustomers: (params?: { page?: number }) => {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  return apiClient<PaginatedResponse<CustomerSummary>>(`/api/customers?${qs}`);
},
```

**Step 2: dashboard 빌드 확인**
```bash
pnpm --filter dashboard build 2>&1 | tail -10
```
Expected: 에러 없음 (또는 타입 오류 있으면 수정)

**Step 3: Commit**
```bash
git add apps/dashboard/src/lib/api.ts
git commit -m "feat(dashboard): add CustomerSummary type and phoneNumber to Conversation"
```

---

### Task 5: Dashboard — 고객 목록 페이지 업데이트

**Files:**
- Modify: `apps/dashboard/src/app/customers/page.tsx`

CustomerSummary 타입을 사용하도록 변경. 전화번호, 대화 수, 마지막 대화 컬럼 표시.

**Step 1: 파일 전체 교체**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  api,
  type CustomerSummary,
  type CustomerStats,
  type PaginatedResponse,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Users, Link2, UserPlus } from "lucide-react";

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersContent />
    </Suspense>
  );
}

function CustomersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = Number(searchParams.get("page") || "1");

  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [data, setData] = useState<PaginatedResponse<CustomerSummary> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCustomerStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    api.listCustomers({ page }).then(setData).catch((e) => setError(e.message));
  }, [page]);

  const statCards = [
    { title: "총 고객", value: stats?.totalCustomers ?? "-", icon: Users },
    { title: "Cafe24 연결됨", value: stats?.linkedCustomers ?? "-", icon: Link2 },
    { title: "오늘 신규", value: stats?.todayNew ?? "-", icon: UserPlus },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
      {error && (
        <p className="mt-2 text-sm text-destructive">
          데이터를 불러올 수 없습니다: {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">전화번호</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">카카오 ID</th>
                <th className="px-4 py-3 font-medium">Cafe24 연결</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">대화 수</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">마지막 대화</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((customer) => (
                <tr
                  key={customer.kakaoUserId}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  onClick={() =>
                    router.push(
                      `/customers/detail?id=${encodeURIComponent(customer.kakaoUserId)}`,
                    )
                  }
                >
                  <td className="px-4 py-3 font-medium">
                    {customer.phoneNumber
                      ? customer.phoneNumber.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
                      : <span className="text-muted-foreground text-xs">미등록</span>}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className="font-mono text-xs text-muted-foreground">
                      {customer.kakaoUserId.slice(0, 12)}...
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {customer.cafe24CustomerId ? (
                      <Badge variant="success">연결됨</Badge>
                    ) : (
                      <Badge variant="muted">미연결</Badge>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {customer.conversationCount}회
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {customer.lastConversationAt
                      ? formatDate(customer.lastConversationAt)
                      : "-"}
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    등록된 고객이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: data.totalPages }, (_, i) => (
            <Link key={i} href={`/customers?page=${i + 1}`}>
              <Button
                variant={page === i + 1 ? "default" : "outline"}
                size="sm"
              >
                {i + 1}
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: 빌드 확인**
```bash
pnpm --filter dashboard build 2>&1 | tail -5
```

**Step 3: Commit**
```bash
git add apps/dashboard/src/app/customers/page.tsx
git commit -m "feat(dashboard): show all customers with phone and conversation stats"
```

---

### Task 6: Dashboard — 대화 로그 + 미해결 문의에 전화번호 추가

**Files:**
- Modify: `apps/dashboard/src/app/conversations/page.tsx`
- Modify: `apps/dashboard/src/app/conversations/unresolved/page.tsx`

**Step 1: 대화 로그 페이지 — 사용자 컬럼에 전화번호 추가**

`conversations/page.tsx`에서 "사용자" 컬럼 셀 교체:

현재:
```typescript
<td className="hidden px-4 py-3 lg:table-cell">
  <Link
    href={`/customers/detail?id=${conv.kakaoUserId}`}
    className="font-mono text-xs text-primary hover:underline"
  >
    {conv.kakaoUserId.slice(0, 10)}...
  </Link>
</td>
```

교체:
```typescript
<td className="hidden px-4 py-3 lg:table-cell">
  <Link
    href={`/customers/detail?id=${encodeURIComponent(conv.kakaoUserId)}`}
    className="hover:underline"
  >
    {conv.phoneNumber ? (
      <span className="text-sm font-medium text-primary">
        {conv.phoneNumber.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")}
      </span>
    ) : (
      <span className="font-mono text-xs text-muted-foreground">
        {conv.kakaoUserId.slice(0, 10)}...
      </span>
    )}
  </Link>
</td>
```

**Step 2: 미해결 문의 페이지 — 고객 식별자에 전화번호 추가**

`conversations/unresolved/page.tsx`에서 고객 표시 부분 교체:

현재:
```typescript
<Link
  href={`/customers/detail?id=${conv.kakaoUserId}`}
  className="flex items-center gap-1 font-mono text-primary hover:underline"
>
  <User className="h-3 w-3" />
  {conv.kakaoUserId.slice(0, 10)}...
</Link>
```

교체:
```typescript
<Link
  href={`/customers/detail?id=${encodeURIComponent(conv.kakaoUserId)}`}
  className="flex items-center gap-1 text-primary hover:underline"
>
  <User className="h-3 w-3" />
  {conv.phoneNumber
    ? conv.phoneNumber.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
    : `${conv.kakaoUserId.slice(0, 10)}...`}
</Link>
```

**Step 3: 빌드 확인**
```bash
pnpm --filter dashboard build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 4: Commit**
```bash
git add apps/dashboard/src/app/conversations/page.tsx apps/dashboard/src/app/conversations/unresolved/page.tsx
git commit -m "feat(dashboard): show phone number in conversation and unresolved pages"
```

---

### Task 7: 배포 및 검증

**Step 1: Workers 배포**
```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot/apps/workers
pnpm run deploy 2>&1 | tail -5
```
Expected: `Deployed kb-chatbot-api triggers`

**Step 2: API 검증**
```bash
# 고객 목록 — conversations 기반
curl -s "https://kb-chatbot-api.gopeace88.workers.dev/api/customers" \
  -H "Cf-Access-Jwt-Assertion: dev" \
  -H "cf-access-authenticated-user-email: dev@localhost" | python3 -m json.tool | head -40
```
Expected: `conversationCount`, `phoneNumber` 포함한 목록

**Step 3: Git push (Vercel 자동 배포)**
```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot
git push origin master
```
