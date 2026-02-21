# Infrastructure Monitoring Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Neon DB, CF Workers, CF Pages, AI Gateway 사용량/비용을 대시보드에서 모니터링할 수 있는 탭 기반 페이지를 추가한다.

**Architecture:** Workers에 `/api/monitoring/*` 프록시 엔드포인트 4개를 추가하고, 대시보드에 `/monitoring` 페이지(4개 탭)를 만든다. API 키는 Workers secrets에 보관하여 클라이언트 노출을 방지한다.

**Tech Stack:** Hono (Workers route), Next.js 15 (dashboard page), CF GraphQL Analytics API, Neon REST API, Tailwind CSS

---

### Task 1: Workers 환경 변수 타입 추가

**Files:**
- Modify: `apps/workers/src/lib/env.ts:4-28`

**Step 1: NEON_API_KEY, CF_API_TOKEN 타입 추가**

`Env` 인터페이스의 `// Secrets` 섹션에 추가:

```typescript
// Monitoring API keys
NEON_API_KEY: string;
CF_API_TOKEN: string;
CF_ACCOUNT_ID: string;
```

**Step 2: Commit**

```bash
git add apps/workers/src/lib/env.ts
git commit -m "feat(monitoring): add NEON_API_KEY, CF_API_TOKEN, CF_ACCOUNT_ID env types"
```

---

### Task 2: Workers 모니터링 라우트 — Neon 프록시

**Files:**
- Create: `apps/workers/src/routes/monitoring.ts`
- Modify: `apps/workers/src/index.ts:69` (라우트 등록)

**Step 1: Neon 프록시 엔드포인트 작성**

`apps/workers/src/routes/monitoring.ts`:

```typescript
import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";

const monitoring = new Hono<AppEnv>();

// GET /api/monitoring/neon?days=7
monitoring.get("/neon", async (c) => {
  const env = c.env;
  const days = Number(c.req.query("days") || "7");

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  // Fetch project info + consumption in parallel
  const [projectRes, consumptionRes] = await Promise.all([
    fetch("https://console.neon.tech/api/v2/projects/red-heart-96250839", {
      headers: { Authorization: `Bearer ${env.NEON_API_KEY}` },
    }),
    fetch(
      `https://console.neon.tech/api/v2/consumption_history/v2/projects?` +
        new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          granularity: days <= 7 ? "daily" : "daily",
          project_ids: "red-heart-96250839",
          limit: "1",
        }),
      { headers: { Authorization: `Bearer ${env.NEON_API_KEY}` } },
    ),
  ]);

  if (!projectRes.ok || !consumptionRes.ok) {
    const errText = !projectRes.ok
      ? await projectRes.text()
      : await consumptionRes.text();
    return c.json({ error: "Neon API error", details: errText }, 502);
  }

  const project = await projectRes.json();
  const consumption = await consumptionRes.json();

  return c.json({ project, consumption });
});

export { monitoring };
```

**Step 2: index.ts에 라우트 등록**

`apps/workers/src/index.ts`에 import 추가 + route 등록:

```typescript
import { monitoring } from "./routes/monitoring.js";
// ... 기존 route 뒤에:
app.route("/api/monitoring", monitoring);
```

**Step 3: 로컬 테스트**

```bash
cd apps/workers && pnpm dev
# 다른 터미널에서:
curl "http://localhost:8787/api/monitoring/neon?days=7" \
  -H "Cf-Access-Jwt-Assertion: dev"
```

Expected: Neon API 응답 JSON (NEON_API_KEY가 로컬에 없으면 502 — secrets 설정 후 재시도)

**Step 4: Commit**

```bash
git add apps/workers/src/routes/monitoring.ts apps/workers/src/index.ts
git commit -m "feat(monitoring): add Neon DB proxy endpoint"
```

---

### Task 3: Workers 모니터링 라우트 — CF Workers/Pages/AI Gateway 프록시

**Files:**
- Modify: `apps/workers/src/routes/monitoring.ts`

**Step 1: CF GraphQL 헬퍼 함수 추가**

`monitoring.ts` 상단에 헬퍼 추가:

```typescript
async function cfGraphQL(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF GraphQL error: ${res.status} ${text}`);
  }
  return res.json();
}
```

**Step 2: CF Workers 엔드포인트 추가**

```typescript
// GET /api/monitoring/cf-workers?days=7
monitoring.get("/cf-workers", async (c) => {
  const env = c.env;
  const days = Number(c.req.query("days") || "7");

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const query = `query ($accountTag: String!, $from: Date!, $to: Date!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersOverviewRequestsAdaptiveGroups(
          limit: 1000
          filter: { date_geq: $from, date_leq: $to }
          orderBy: [date_ASC]
        ) {
          sum { requests errors subrequests }
          dimensions { date scriptName }
        }
      }
    }
  }`;

  try {
    const data = await cfGraphQL(env.CF_API_TOKEN, query, {
      accountTag: env.CF_ACCOUNT_ID,
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    });
    return c.json(data);
  } catch (e) {
    return c.json({ error: "CF Workers API error", details: String(e) }, 502);
  }
});
```

**Step 3: CF Pages 엔드포인트 추가**

```typescript
// GET /api/monitoring/cf-pages?limit=20
monitoring.get("/cf-pages", async (c) => {
  const env = c.env;
  const limit = Number(c.req.query("limit") || "20");

  // Fetch recent deployments for the dashboard project
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/kb-chatbot-dashboard/deployments?per_page=${limit}`,
    { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } },
  );

  if (!res.ok) {
    const text = await res.text();
    return c.json({ error: "CF Pages API error", details: text }, 502);
  }

  const data = await res.json();
  return c.json(data);
});
```

**Step 4: AI Gateway 엔드포인트 추가**

```typescript
// GET /api/monitoring/cf-ai-gateway?days=7
monitoring.get("/cf-ai-gateway", async (c) => {
  const env = c.env;
  const days = Number(c.req.query("days") || "7");

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const query = `query ($accountTag: String!, $from: String!, $to: String!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        aiGatewayRequestsAdaptiveGroups(
          limit: 1000
          filter: {
            datetime_geq: $from
            datetime_leq: $to
            gateway: "kb-chatbot"
          }
          orderBy: [datetimeHour_ASC]
        ) {
          count
          sum {
            cachedRequests
            erroredRequests
            cost
            cachedTokensIn
            cachedTokensOut
            uncachedTokensIn
            uncachedTokensOut
          }
          dimensions {
            datetimeHour
            model
            provider
          }
        }
      }
    }
  }`;

  try {
    const data = await cfGraphQL(env.CF_API_TOKEN, query, {
      accountTag: env.CF_ACCOUNT_ID,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    return c.json(data);
  } catch (e) {
    return c.json({ error: "CF AI Gateway API error", details: String(e) }, 502);
  }
});
```

**Step 5: 로컬 테스트**

```bash
curl "http://localhost:8787/api/monitoring/cf-workers?days=7" -H "Cf-Access-Jwt-Assertion: dev"
curl "http://localhost:8787/api/monitoring/cf-pages" -H "Cf-Access-Jwt-Assertion: dev"
curl "http://localhost:8787/api/monitoring/cf-ai-gateway?days=7" -H "Cf-Access-Jwt-Assertion: dev"
```

**Step 6: Commit**

```bash
git add apps/workers/src/routes/monitoring.ts
git commit -m "feat(monitoring): add CF Workers, Pages, AI Gateway proxy endpoints"
```

---

### Task 4: Dashboard API 타입 + 함수 추가

**Files:**
- Modify: `apps/dashboard/src/lib/api.ts`

**Step 1: 모니터링 타입 추가**

`api.ts` 타입 섹션 끝(UnansweredQuestion 뒤)에 추가:

```typescript
// ── Monitoring 타입 ──

export interface NeonMonitoringData {
  project: {
    project: {
      id: string;
      name: string;
      region_id: string;
      pg_version: number;
      compute_time_seconds: number;
      active_time_seconds: number;
      data_transfer_bytes: number;
      written_data_bytes: number;
      synthetic_storage_size: number;
      compute_last_active_at: string;
      consumption_period_start: string;
      consumption_period_end: string;
      owner: {
        subscription_type: string;
      };
    };
  };
  consumption: {
    projects: Array<{
      project_id: string;
      periods: Array<{
        period_plan: string;
        consumption: Array<{
          timeframe_start: string;
          timeframe_end: string;
          metrics: Array<{
            metric_name: string;
            value: number;
          }>;
        }>;
      }>;
    }>;
  };
}

export interface CFWorkersData {
  data: {
    viewer: {
      accounts: Array<{
        workersOverviewRequestsAdaptiveGroups: Array<{
          sum: { requests: number; errors: number; subrequests: number };
          dimensions: { date: string; scriptName: string };
        }>;
      }>;
    };
  };
}

export interface CFPagesData {
  result: Array<{
    id: string;
    short_id: string;
    project_name: string;
    environment: string;
    url: string;
    latest_stage: {
      name: string;
      status: string;
      started_on: string;
      ended_on: string;
    };
    deployment_trigger: {
      type: string;
      metadata: {
        branch: string;
        commit_hash: string;
        commit_message: string;
      };
    };
    created_on: string;
  }>;
}

export interface CFAIGatewayData {
  data: {
    viewer: {
      accounts: Array<{
        aiGatewayRequestsAdaptiveGroups: Array<{
          count: number;
          sum: {
            cachedRequests: number;
            erroredRequests: number;
            cost: number;
            cachedTokensIn: number;
            cachedTokensOut: number;
            uncachedTokensIn: number;
            uncachedTokensOut: number;
          };
          dimensions: {
            datetimeHour: string;
            model: string;
            provider: string;
          };
        }>;
      }>;
    };
  };
}
```

**Step 2: API 함수 추가**

`api.ts`의 `api` 객체 끝에 추가 (deleteBlockedTerm 뒤):

```typescript
  // Monitoring
  getMonitoringNeon: (days = 7) =>
    apiClient<NeonMonitoringData>(`/api/monitoring/neon?days=${days}`),
  getMonitoringCFWorkers: (days = 7) =>
    apiClient<CFWorkersData>(`/api/monitoring/cf-workers?days=${days}`),
  getMonitoringCFPages: (limit = 20) =>
    apiClient<CFPagesData>(`/api/monitoring/cf-pages?limit=${limit}`),
  getMonitoringCFAIGateway: (days = 7) =>
    apiClient<CFAIGatewayData>(`/api/monitoring/cf-ai-gateway?days=${days}`),
```

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/api.ts
git commit -m "feat(monitoring): add monitoring API types and functions"
```

---

### Task 5: Dashboard 모니터링 페이지 — 탭 레이아웃 + Neon 탭

**Files:**
- Create: `apps/dashboard/src/app/monitoring/page.tsx`

**Step 1: 페이지 생성 — 탭 레이아웃 + Neon 탭**

`apps/dashboard/src/app/monitoring/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  api,
  type NeonMonitoringData,
  type CFWorkersData,
  type CFPagesData,
  type CFAIGatewayData,
} from "@/lib/api";
import {
  Database,
  Server,
  Globe,
  Cpu,
  RefreshCw,
} from "lucide-react";

type Tab = "neon" | "cf-workers" | "cf-pages" | "cf-ai-gateway";

const TABS: Array<{ id: Tab; label: string; icon: typeof Database }> = [
  { id: "neon", label: "Neon DB", icon: Database },
  { id: "cf-workers", label: "CF Workers", icon: Server },
  { id: "cf-pages", label: "CF Pages", icon: Globe },
  { id: "cf-ai-gateway", label: "AI Gateway", icon: Cpu },
];

export default function MonitoringPage() {
  const [tab, setTab] = useState<Tab>("neon");
  const [days, setDays] = useState(7);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">인프라 모니터링</h1>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {[
            { label: "7일", value: 7 },
            { label: "30일", value: 30 },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                days === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="mt-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-gray-700"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="mt-6">
        {tab === "neon" && <NeonTab days={days} />}
        {tab === "cf-workers" && <CFWorkersTab days={days} />}
        {tab === "cf-pages" && <CFPagesTab />}
        {tab === "cf-ai-gateway" && <CFAIGatewayTab days={days} />}
      </div>
    </div>
  );
}

/* ── Neon DB 탭 ── */

function NeonTab({ days }: { days: number }) {
  const [data, setData] = useState<NeonMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true);
    setError("");
    api.getMonitoringNeon(days)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [days]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;
  if (!data) return null;

  const proj = data.project.project;
  const periods = data.consumption.projects?.[0]?.periods ?? [];
  const consumption = periods.flatMap((p) => p.consumption);

  // Aggregate metrics from consumption data
  const metrics: Record<string, number> = {};
  for (const entry of consumption) {
    for (const m of entry.metrics) {
      metrics[m.metric_name] = (metrics[m.metric_name] || 0) + m.value;
    }
  }

  // Daily data for chart
  const dailyCompute = consumption.map((entry) => ({
    date: entry.timeframe_start.split("T")[0],
    value: entry.metrics.find((m) => m.metric_name === "compute_unit_seconds")?.value || 0,
  }));

  return (
    <div>
      {/* 프로젝트 정보 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="플랜" value={proj.owner.subscription_type.toUpperCase()} subtitle={`Region: ${proj.region_id}`} />
        <MetricCard title="Compute" value={formatSeconds(metrics.compute_unit_seconds || proj.compute_time_seconds)} subtitle={`Active: ${formatSeconds(proj.active_time_seconds)}`} />
        <MetricCard title="Storage" value={formatBytes(proj.synthetic_storage_size)} subtitle={`Written: ${formatBytes(proj.written_data_bytes)}`} />
        <MetricCard title="Data Transfer" value={formatBytes(metrics.public_network_transfer_bytes || proj.data_transfer_bytes)} subtitle={`${days}일 기준`} />
      </div>

      {/* 일별 Compute 추이 */}
      {dailyCompute.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              일별 Compute (CU-seconds)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={dailyCompute} />
          </CardContent>
        </Card>
      )}

      {/* 상세 정보 */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">상세 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">PostgreSQL</dt>
            <dd>v{proj.pg_version}</dd>
            <dt className="text-muted-foreground">마지막 활동</dt>
            <dd>{proj.compute_last_active_at ? new Date(proj.compute_last_active_at).toLocaleString("ko-KR") : "-"}</dd>
            <dt className="text-muted-foreground">빌링 주기</dt>
            <dd>{proj.consumption_period_start?.split("T")[0] || "-"} ~ {proj.consumption_period_end?.split("T")[0] || "-"}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── CF Workers 탭 (placeholder — Task 6에서 구현) ── */

function CFWorkersTab({ days }: { days: number }) {
  const [data, setData] = useState<CFWorkersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true);
    setError("");
    api.getMonitoringCFWorkers(days)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [days]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;
  if (!data) return null;

  const groups = data.data?.viewer?.accounts?.[0]?.workersOverviewRequestsAdaptiveGroups ?? [];

  // Aggregate totals
  let totalRequests = 0;
  let totalErrors = 0;
  let totalSubrequests = 0;
  const dailyData: Record<string, { requests: number; errors: number }> = {};
  const scriptData: Record<string, number> = {};

  for (const g of groups) {
    totalRequests += g.sum.requests;
    totalErrors += g.sum.errors;
    totalSubrequests += g.sum.subrequests;
    const date = g.dimensions.date;
    if (!dailyData[date]) dailyData[date] = { requests: 0, errors: 0 };
    dailyData[date].requests += g.sum.requests;
    dailyData[date].errors += g.sum.errors;
    const script = g.dimensions.scriptName || "unknown";
    scriptData[script] = (scriptData[script] || 0) + g.sum.requests;
  }

  const dailyChart = Object.entries(dailyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, value: d.requests }));

  const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : "0";

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="총 요청" value={totalRequests.toLocaleString()} subtitle={`${days}일 기준`} />
        <MetricCard title="에러" value={totalErrors.toLocaleString()} subtitle={`에러율 ${errorRate}%`} />
        <MetricCard title="서브 요청" value={totalSubrequests.toLocaleString()} subtitle="외부 API 호출" />
        <MetricCard title="스크립트" value={String(Object.keys(scriptData).length)} subtitle="활성 Workers" />
      </div>

      {dailyChart.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">일별 요청 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={dailyChart} />
          </CardContent>
        </Card>
      )}

      {Object.keys(scriptData).length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">스크립트별 요청</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(scriptData)
                .sort(([, a], [, b]) => b - a)
                .map(([name, count]) => {
                  const maxCount = Math.max(...Object.values(scriptData));
                  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-sm">
                        <span className="font-mono">{name}</span>
                        <span className="font-medium">{count.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── CF Pages 탭 ── */

function CFPagesTab() {
  const [data, setData] = useState<CFPagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true);
    setError("");
    api.getMonitoringCFPages(20)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;
  if (!data) return null;

  const deployments = data.result ?? [];

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard title="총 배포" value={String(deployments.length)} subtitle="최근 20건" />
        <MetricCard
          title="성공"
          value={String(deployments.filter((d) => d.latest_stage?.status === "success").length)}
          subtitle="배포 성공"
        />
        <MetricCard
          title="실패"
          value={String(deployments.filter((d) => d.latest_stage?.status === "failure").length)}
          subtitle="배포 실패"
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">최근 배포</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">환경</th>
                  <th className="pb-2 pr-4 font-medium">브랜치</th>
                  <th className="hidden pb-2 pr-4 font-medium md:table-cell">커밋</th>
                  <th className="pb-2 pr-4 font-medium">상태</th>
                  <th className="pb-2 font-medium">시간</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        d.environment === "production"
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {d.environment}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {d.deployment_trigger?.metadata?.branch || "-"}
                    </td>
                    <td className="hidden py-2 pr-4 font-mono text-xs text-muted-foreground md:table-cell">
                      {d.deployment_trigger?.metadata?.commit_message?.slice(0, 50) || "-"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        d.latest_stage?.status === "success"
                          ? "bg-green-100 text-green-700"
                          : d.latest_stage?.status === "failure"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {d.latest_stage?.status || "unknown"}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(d.created_on).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── AI Gateway 탭 ── */

function CFAIGatewayTab({ days }: { days: number }) {
  const [data, setData] = useState<CFAIGatewayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true);
    setError("");
    api.getMonitoringCFAIGateway(days)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [days]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;
  if (!data) return null;

  const groups = data.data?.viewer?.accounts?.[0]?.aiGatewayRequestsAdaptiveGroups ?? [];

  // Aggregate
  let totalCount = 0;
  let totalCost = 0;
  let totalCached = 0;
  let totalErrors = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const modelData: Record<string, number> = {};
  const hourlyData: Record<string, number> = {};

  for (const g of groups) {
    totalCount += g.count;
    totalCost += g.sum.cost;
    totalCached += g.sum.cachedRequests;
    totalErrors += g.sum.erroredRequests;
    totalTokensIn += g.sum.uncachedTokensIn + g.sum.cachedTokensIn;
    totalTokensOut += g.sum.uncachedTokensOut + g.sum.cachedTokensOut;
    const model = g.dimensions.model || "unknown";
    modelData[model] = (modelData[model] || 0) + g.count;
    // Aggregate by date (from datetimeHour)
    const date = g.dimensions.datetimeHour?.split("T")[0];
    if (date) {
      hourlyData[date] = (hourlyData[date] || 0) + g.count;
    }
  }

  const dailyChart = Object.entries(hourlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="총 요청" value={totalCount.toLocaleString()} subtitle={`${days}일 기준`} />
        <MetricCard title="예상 비용" value={`$${totalCost.toFixed(4)}`} subtitle="OpenAI 기준" />
        <MetricCard title="토큰 (In)" value={totalTokensIn.toLocaleString()} subtitle={`캐시: ${(totalCount > 0 ? ((totalCached / totalCount) * 100).toFixed(0) : 0)}%`} />
        <MetricCard title="토큰 (Out)" value={totalTokensOut.toLocaleString()} subtitle={`에러: ${totalErrors}`} />
      </div>

      {dailyChart.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">일별 요청 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={dailyChart} />
          </CardContent>
        </Card>
      )}

      {Object.keys(modelData).length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">모델별 요청</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(modelData)
                .sort(([, a], [, b]) => b - a)
                .map(([name, count]) => {
                  const maxCount = Math.max(...Object.values(modelData));
                  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-sm">
                        <span className="font-mono">{name}</span>
                        <span className="font-medium">{count.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── 공통 컴포넌트 ── */

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function SimpleBarChart({ data }: { data: Array<{ date: string; value: number }> }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {data.map((item) => {
        const height = Math.max((item.value / maxValue) * 100, 4);
        const label = item.date.slice(5);
        return (
          <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-medium">{item.value}</span>
            <div
              className="w-full rounded-t bg-primary"
              style={{ height: `${height}%`, minHeight: 4 }}
            />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        );
      })}
      {data.length === 0 && (
        <p className="w-full text-center text-sm text-muted-foreground">데이터가 없습니다.</p>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">로딩 중...</span>
    </div>
  );
}

function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}

/* ── 유틸 ── */

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatSeconds(seconds: number): string {
  if (!seconds || seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
```

**Step 2: 로컬에서 페이지 확인**

```bash
cd apps/dashboard && pnpm dev
# 브라우저에서 http://localhost:3000/monitoring 접속
```

Expected: 4개 탭이 있는 모니터링 페이지. Workers API가 실행 중이 아니면 에러 표시.

**Step 3: Commit**

```bash
git add apps/dashboard/src/app/monitoring/page.tsx
git commit -m "feat(monitoring): add monitoring page with 4 tab layout"
```

---

### Task 6: 사이드바 + 모바일 네비게이션에 메뉴 추가

**Files:**
- Modify: `apps/dashboard/src/components/layout/sidebar.tsx:6-17` (아이콘 import)
- Modify: `apps/dashboard/src/components/layout/sidebar.tsx:19-30` (navItems)
- Modify: `apps/dashboard/src/components/layout/mobile-nav.tsx:7-15` (아이콘 import)
- Modify: `apps/dashboard/src/components/layout/mobile-nav.tsx:17-23` (navItems)

**Step 1: sidebar.tsx 수정**

아이콘 import에 `Activity` 추가:
```typescript
import {
  LayoutDashboard,
  BookOpen,
  FileUp,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
  MessagesSquare,
  Users,
  Shield,
  Settings,
  Activity,
} from "lucide-react";
```

navItems 배열에서 "차단 관리"와 "설정" 사이에 추가:
```typescript
  { href: "/settings/blocked-terms", label: "차단 관리", icon: Shield },
  { href: "/monitoring", label: "인프라 모니터링", icon: Activity },
  { href: "/settings", label: "설정", icon: Settings },
```

**Step 2: mobile-nav.tsx 수정**

아이콘 import에 `Activity` 추가:
```typescript
import {
  Menu,
  X,
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  MessagesSquare,
  Settings,
  Activity,
} from "lucide-react";
```

navItems에 설정 앞에 추가:
```typescript
  { href: "/monitoring", label: "인프라 모니터링", icon: Activity },
  { href: "/settings", label: "설정", icon: Settings },
```

**Step 3: Commit**

```bash
git add apps/dashboard/src/components/layout/sidebar.tsx apps/dashboard/src/components/layout/mobile-nav.tsx
git commit -m "feat(monitoring): add monitoring menu to sidebar and mobile nav"
```

---

### Task 7: Workers Secrets 설정 + 배포 테스트

**Step 1: Neon API Key 발급**

Neon Console → Account settings → API keys → Create new API key
- Type: Personal API Key
- 토큰을 복사하여 보관

**Step 2: Cloudflare API Token 발급**

CF Dashboard → My Profile → API Tokens → Create Token
- Permission: Account > Account Analytics > Read
- Permission: Account > Cloudflare Pages > Read
- Account resources: 해당 계정 선택
- 토큰 복사하여 보관

**Step 3: Workers Secrets 등록**

```bash
cd apps/workers
npx wrangler secret put NEON_API_KEY
# 발급받은 Neon API Key 입력
npx wrangler secret put CF_API_TOKEN
# 발급받은 CF API Token 입력
npx wrangler secret put CF_ACCOUNT_ID
# 28b9de8f436a1a7b49eeb39d61b1fefd 입력
```

**Step 4: Workers 배포**

```bash
cd apps/workers && npx wrangler deploy
```

**Step 5: Dashboard 배포**

```bash
cd apps/dashboard && pnpm build
# CF Pages에 자동 배포 (git push 또는 수동)
```

**Step 6: 프로덕션 테스트**

```bash
# Workers API 직접 테스트
curl "https://kb-api.runvision.ai/api/monitoring/neon?days=7"
curl "https://kb-api.runvision.ai/api/monitoring/cf-workers?days=7"
curl "https://kb-api.runvision.ai/api/monitoring/cf-pages"
curl "https://kb-api.runvision.ai/api/monitoring/cf-ai-gateway?days=7"
```

대시보드에서 `/monitoring` 접속하여 4개 탭 모두 데이터 확인.

**Step 7: Commit (설정 변경은 없지만 최종 확인 후)**

```bash
git add -A && git status
# 변경사항 있으면 커밋
```

---

## Summary

| Task | 파일 | 설명 |
|------|------|------|
| 1 | `apps/workers/src/lib/env.ts` | 환경변수 타입 추가 |
| 2 | `apps/workers/src/routes/monitoring.ts`, `index.ts` | Neon 프록시 엔드포인트 |
| 3 | `apps/workers/src/routes/monitoring.ts` | CF Workers/Pages/AI Gateway 프록시 |
| 4 | `apps/dashboard/src/lib/api.ts` | 모니터링 API 타입 + 함수 |
| 5 | `apps/dashboard/src/app/monitoring/page.tsx` | 모니터링 페이지 (4탭) |
| 6 | `sidebar.tsx`, `mobile-nav.tsx` | 사이드바/모바일 메뉴 추가 |
| 7 | (secrets + deploy) | API 키 설정 + 배포 테스트 |

**New Secrets:** `NEON_API_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`

**New Files:** 2개 (`monitoring.ts`, `monitoring/page.tsx`)
**Modified Files:** 4개 (`env.ts`, `index.ts`, `api.ts`, `sidebar.tsx`, `mobile-nav.tsx`)
