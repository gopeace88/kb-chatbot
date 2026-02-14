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
  const periods = data.consumption?.projects?.[0]?.periods ?? [];
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

/* ── CF Workers 탭 ── */

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

  const groups = data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];

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
            <BarBreakdown data={scriptData} color="bg-blue-500" />
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
            <BarBreakdown data={modelData} color="bg-purple-500" />
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

function BarBreakdown({ data, color }: { data: Record<string, number>; color: string }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const maxCount = entries.length > 0 ? entries[0][1] : 0;
  return (
    <div className="space-y-2">
      {entries.map(([name, count]) => {
        const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
        return (
          <div key={name}>
            <div className="flex justify-between text-sm">
              <span className="font-mono">{name}</span>
              <span className="font-medium">{count.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
              <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
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
