# Customer Detail Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 고객 상세 페이지에 고객 기본 정보(전화번호, Cafe24 연결)를 추가하고, 고객 목록에서 클릭 시 상세 이동.

**Architecture:**
- Workers: `GET /api/customers/:kakaoUserId` 엔드포인트 추가 (기존 `getCustomerLink` 함수 활용)
- Dashboard api.ts: `getCustomer(kakaoUserId)` 함수 추가
- 고객 상세 페이지(`/customers/detail`): 상단에 고객 정보 패널 추가, 기존 대화 이력 유지
- 고객 목록 페이지(`/customers`): 행 클릭 → `/customers/detail?id=<kakaoUserId>` 이동

**Tech Stack:** Hono (CF Workers), Next.js 15, Drizzle ORM, TypeScript

---

### Task 1: Workers API — GET /api/customers/:kakaoUserId 추가

**Files:**
- Modify: `apps/workers/src/routes/customers.ts`

현재 `customers.ts`에는 목록(`/`)과 통계(`/stats`)만 있음. 개별 고객 조회 엔드포인트 추가.

**Step 1: 엔드포인트 추가**

`apps/workers/src/routes/customers.ts`의 마지막 `export { customers };` 바로 위에 삽입:

```typescript
// GET /api/customers/:kakaoUserId — 개별 고객 조회
customers.get("/:kakaoUserId", async (c) => {
  const db = c.get("db");
  const kakaoUserId = c.req.param("kakaoUserId");
  const customer = await getCustomerLink(db, kakaoUserId);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json(customer);
});
```

`getCustomerLink`는 이미 import되어 있음 (`from "@kb-chatbot/kb-engine"`).

**Step 2: 빌드 확인**
```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot
pnpm --filter workers build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 3: Commit**
```bash
git add apps/workers/src/routes/customers.ts
git commit -m "feat(api): add GET /api/customers/:kakaoUserId endpoint"
```

---

### Task 2: Dashboard API client — getCustomer 함수 추가

**Files:**
- Modify: `apps/dashboard/src/lib/api.ts`

**Step 1: api 객체에 getCustomer 추가**

`api.ts`의 `api` 객체 내 `listCustomers` 아래에 추가:

```typescript
  getCustomer: (kakaoUserId: string) =>
    apiClient<CustomerLink>(`/api/customers/${encodeURIComponent(kakaoUserId)}`),
```

**Step 2: 빌드 확인**
```bash
pnpm --filter dashboard build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 3: Commit**
```bash
git add apps/dashboard/src/lib/api.ts
git commit -m "feat(dashboard): add getCustomer API client function"
```

---

### Task 3: 고객 상세 페이지 — 고객 정보 패널 추가

**Files:**
- Modify: `apps/dashboard/src/app/customers/detail/page.tsx`

현재 `/customers/detail?id=<kakaoUserId>` 페이지는 대화 이력만 표시. kakaoUserId로 고객 정보를 fetch해서 상단에 패널 추가.

**현재 파일 구조:**
- `useEffect` → `api.listConversations({ kakaoUserId })` 호출
- 통계 카드 3개 (총 대화, 첫 문의, 마지막 문의)
- 대화 이력 카드 목록

**Step 1: 고객 정보 패널 추가**

파일 전체를 다음으로 교체:

```typescript
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type Conversation, type CustomerLink } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, MessageSquare, Calendar, Loader2, Phone, User, Link2 } from "lucide-react";

const sourceBadge: Record<string, { label: string; variant: "success" | "default" | "destructive" }> = {
  kb_match: { label: "KB 매칭", variant: "success" },
  ai_generated: { label: "AI 생성", variant: "default" },
  fallback: { label: "폴백", variant: "destructive" },
};

function CustomerDetail() {
  const searchParams = useSearchParams();
  const kakaoUserId = searchParams.get("id") || "";
  const [customer, setCustomer] = useState<CustomerLink | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!kakaoUserId) return;
    setLoading(true);
    Promise.all([
      api.getCustomer(kakaoUserId).then(setCustomer).catch(() => {}),
      api.listConversations({ kakaoUserId }).then((res) => {
        setConversations(res.data);
        setTotal(res.total);
      }),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [kakaoUserId]);

  const firstDate = conversations.length > 0
    ? conversations[conversations.length - 1].createdAt
    : null;
  const lastDate = conversations.length > 0
    ? conversations[0].createdAt
    : null;

  if (!kakaoUserId) {
    return (
      <div className="py-12 text-center text-gray-500">
        고객 ID가 지정되지 않았습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/customers"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          고객 관리
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">고객 상세</h1>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-gray-500">로딩 중...</span>
        </div>
      ) : (
        <>
          {/* 고객 정보 패널 */}
          <Card>
            <CardContent className="py-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">고객 정보</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-start gap-2">
                  <User className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">카카오 ID</p>
                    <p className="mt-0.5 break-all font-mono text-xs text-gray-900">{kakaoUserId}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">전화번호</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-900">
                      {customer?.phoneNumber
                        ? customer.phoneNumber.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
                        : <span className="text-muted-foreground">미등록</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Link2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cafe24 연결</p>
                    <div className="mt-0.5">
                      {customer?.cafe24CustomerId ? (
                        <Badge variant="success">연결됨</Badge>
                      ) : (
                        <Badge variant="muted">미연결</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">등록일</p>
                    <p className="mt-0.5 text-sm text-gray-900">
                      {customer ? formatDate(customer.createdAt) : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 대화 통계 */}
          {conversations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-4 text-gray-500">대화 기록이 없습니다.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="py-4">
                    <div className="text-sm text-gray-500">총 대화</div>
                    <div className="mt-1 text-2xl font-bold">{total}회</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="text-sm text-gray-500">첫 문의</div>
                    <div className="mt-1 text-lg font-medium">
                      {firstDate ? formatDate(firstDate) : "-"}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="text-sm text-gray-500">마지막 문의</div>
                    <div className="mt-1 text-lg font-medium">
                      {lastDate ? formatDate(lastDate) : "-"}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 대화 이력 */}
              <div className="space-y-4">
                {conversations.map((conv) => (
                  <Card key={conv.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(conv.createdAt)}
                        </div>
                        <div className="flex items-center gap-2">
                          {conv.similarityScore != null && (
                            <span className="text-xs text-gray-400">
                              유사도 {Math.round(conv.similarityScore * 100)}%
                            </span>
                          )}
                          <Badge variant={sourceBadge[conv.responseSource]?.variant || "default"}>
                            {sourceBadge[conv.responseSource]?.label || conv.responseSource}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="rounded-lg bg-blue-50 p-3">
                          <p className="text-xs font-medium text-blue-600">고객</p>
                          <p className="mt-1 text-sm text-gray-900">{conv.userMessage}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs font-medium text-gray-500">봇</p>
                          <p className="mt-1 text-sm text-gray-900">{conv.botResponse}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <CustomerDetail />
    </Suspense>
  );
}
```

**Step 2: 빌드 확인**
```bash
pnpm --filter dashboard build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 3: Commit**
```bash
git add apps/dashboard/src/app/customers/detail/page.tsx
git commit -m "feat(dashboard): add customer info panel to detail page"
```

---

### Task 4: 고객 목록 — 행 클릭 시 상세 이동

**Files:**
- Modify: `apps/dashboard/src/app/customers/page.tsx`

현재 테이블 `<tr>`에 클릭 이벤트 없음. `useRouter` 추가 + `onClick` 추가.

**Step 1: useRouter import 및 클릭 핸들러 추가**

파일 상단 import에 `useRouter` 추가:
```typescript
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";  // 추가
import Link from "next/link";
```

`CustomersContent` 함수 내 `const page = ...` 아래에:
```typescript
const router = useRouter();
```

테이블의 `<tr>` 태그를 다음으로 변경:
```typescript
<tr
  key={customer.id}
  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
  onClick={() => router.push(`/customers/detail?id=${encodeURIComponent(customer.kakaoUserId)}`)}
>
```

**Step 2: 빌드 확인**
```bash
pnpm --filter dashboard build 2>&1 | tail -5
```
Expected: 에러 없음

**Step 3: Commit**
```bash
git add apps/dashboard/src/app/customers/page.tsx
git commit -m "feat(dashboard): make customer list rows clickable"
```

---

### Task 5: Workers 배포 및 통합 테스트

**Step 1: Workers 배포**
```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot/apps/workers
pnpm run deploy 2>&1 | tail -5
```
Expected: `Deployed kb-chatbot-api triggers`

**Step 2: API 테스트 (전화번호 등록된 사용자)**
```bash
curl -s "https://kb-chatbot-api.gopeace88.workers.dev/api/customers/test-user-phone-collect-001" \
  -H "Cf-Access-Jwt-Assertion: dev" \
  -H "cf-access-authenticated-user-email: dev@localhost" | python3 -m json.tool
```
Expected: `{ "kakaoUserId": "test-user-phone-collect-001", "phoneNumber": "01012345678", ... }`

**Step 3: Vercel 배포 (자동)**

GitHub push 후 Vercel이 자동 배포.
```bash
git push origin master
```

**Step 4: 브라우저에서 확인**

- `https://kb-chatbot-dashboard.vercel.app/customers` — 테이블 행 클릭 → 상세 이동 확인
- 상세 페이지 상단 고객 정보 패널에 전화번호, Cafe24 연결 상태 표시 확인
