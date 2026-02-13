"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type DashboardStats, type RAGStats } from "@/lib/api";
import {
  BookOpen,
  MessageSquare,
  MessagesSquare,
  TrendingUp,
} from "lucide-react";

const SOURCE_LABELS: Record<string, string> = {
  kb_match: "KB 매칭",
  ai_generated: "AI 생성",
  fallback: "폴백",
};

const SOURCE_COLORS: Record<string, string> = {
  kb_match: "#22c55e",
  ai_generated: "#3b82f6",
  fallback: "#f59e0b",
};

export default function DashboardHome() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rag, setRag] = useState<RAGStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getDashboardStats().then(setStats).catch((e) => setError(e.message));
    api.getRAGStats().then(setRag).catch(() => {});
  }, []);

  const cards = [
    {
      title: "총 지식 베이스",
      value: stats ? `${stats.publishedKB} / ${stats.totalKB}` : "-",
      subtitle: "발행 / 전체",
      icon: BookOpen,
    },
    {
      title: "오늘 문의",
      value: stats?.todayInquiries ?? "-",
      subtitle: `신규 ${stats?.newInquiries ?? 0}건`,
      icon: MessageSquare,
    },
    {
      title: "오늘 대화",
      value: stats?.todayConversations ?? "-",
      subtitle: "카카오톡 대화",
      icon: MessagesSquare,
    },
    {
      title: "자동 답변률",
      value: stats ? `${Math.round(stats.autoAnswerRate * 100)}%` : "-",
      subtitle: "KB 매칭 기준",
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
      {error && (
        <p className="mt-2 text-sm text-destructive">
          데이터를 불러올 수 없습니다: {error}
        </p>
      )}

      {/* 기본 통계 카드 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* RAG 성능 섹션 */}
      {rag && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">RAG 성능</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 응답 소스 분포 — 도넛 차트 (conic-gradient) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  응답 소스 분포
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <DonutChart data={rag.sourceDist} />
                  <div className="space-y-2">
                    {rag.sourceDist.map((item) => (
                      <div key={item.source} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{
                            backgroundColor:
                              SOURCE_COLORS[item.source] || "#94a3b8",
                          }}
                        />
                        <span className="text-muted-foreground">
                          {SOURCE_LABELS[item.source] || item.source}
                        </span>
                        <span className="font-medium">
                          {item.count}건 ({item.pct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 일별 대화 추이 — 바 차트 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  일별 대화 추이 (7일)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={rag.dailyConversations} />
              </CardContent>
            </Card>

            {/* 피드백 통계 + 평균 유사도 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  피드백 & 유사도
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">평균 유사도</p>
                    <p className="mt-1 text-2xl font-bold">
                      {rag.avgSimilarity > 0
                        ? (rag.avgSimilarity * 100).toFixed(1) + "%"
                        : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      KB 매칭 기준
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">피드백</p>
                    <div className="mt-1 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">도움됨</span>
                        <span className="font-medium">
                          {rag.feedbackStats.helpful}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-red-500">도움안됨</span>
                        <span className="font-medium">
                          {rag.feedbackStats.notHelpful}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">미응답</span>
                        <span className="font-medium">
                          {rag.feedbackStats.noFeedback}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 카테고리별 KB 사용 빈도 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  카테고리별 KB 사용
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rag.categoryUsage.length > 0 ? (
                  <div className="space-y-2">
                    {rag.categoryUsage.map((cat) => {
                      const maxCount = rag.categoryUsage[0].count;
                      const pct =
                        maxCount > 0
                          ? Math.round((cat.count / maxCount) * 100)
                          : 0;
                      return (
                        <div key={cat.category}>
                          <div className="flex justify-between text-sm">
                            <span>{cat.category}</span>
                            <span className="font-medium">{cat.count}건</span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                            <div
                              className="h-2 rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    데이터가 없습니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── CSS 기반 심플 차트 컴포넌트 ── */

function DonutChart({
  data,
}: {
  data: Array<{ source: string; pct: number }>;
}) {
  // conic-gradient 계산
  let cumulative = 0;
  const gradientStops = data
    .map((item) => {
      const color = SOURCE_COLORS[item.source] || "#94a3b8";
      const start = cumulative;
      cumulative += item.pct;
      return `${color} ${start}% ${cumulative}%`;
    })
    .join(", ");

  const gradient =
    data.length > 0
      ? `conic-gradient(${gradientStops})`
      : "conic-gradient(#e5e7eb 0% 100%)";

  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width: 100,
        height: 100,
        borderRadius: "50%",
        background: gradient,
      }}
    >
      <div
        className="absolute bg-white"
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          top: 20,
          left: 20,
        }}
      />
    </div>
  );
}

function BarChart({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {data.map((item) => {
        const height = Math.max((item.count / maxCount) * 100, 4);
        const label = item.date.slice(5); // MM-DD
        return (
          <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-medium">{item.count}</span>
            <div
              className="w-full rounded-t bg-primary"
              style={{ height: `${height}%`, minHeight: 4 }}
            />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        );
      })}
      {data.length === 0 && (
        <p className="w-full text-center text-sm text-muted-foreground">
          데이터가 없습니다.
        </p>
      )}
    </div>
  );
}
