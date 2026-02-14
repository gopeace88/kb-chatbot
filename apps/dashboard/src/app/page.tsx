"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type DashboardStats, type RAGStats, type TopQuestion } from "@/lib/api";
import {
  AlertTriangle,
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
  const [topQuestions, setTopQuestions] = useState<TopQuestion[]>([]);
  const [period, setPeriod] = useState<number>(7);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getDashboardStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    api.getRAGStats(period).then(setRag).catch(() => {});
    api.getTopQuestions(period).then((res) => setTopQuestions(res.data)).catch(() => {});
  }, [period]);

  const cards = [
    {
      title: "총 지식 베이스",
      value: stats ? `${stats.publishedKB} / ${stats.totalKB}` : "-",
      subtitle: "발행 / 전체",
      icon: BookOpen,
      href: "/kb",
    },
    {
      title: "오늘 문의",
      value: stats?.todayInquiries ?? "-",
      subtitle: `신규 ${stats?.newInquiries ?? 0}건`,
      icon: MessageSquare,
      href: "/inquiries",
    },
    {
      title: "오늘 대화",
      value: stats?.todayConversations ?? "-",
      subtitle: "카카오톡 대화",
      icon: MessagesSquare,
      href: "/conversations",
    },
    {
      title: "미해결 문의",
      value: stats?.unresolvedCount ?? "-",
      subtitle: "상담사 답변 대기",
      icon: AlertTriangle,
      href: "/conversations/unresolved",
      highlight: (stats?.unresolvedCount ?? 0) > 0,
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
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => {
          const highlight = "highlight" in card && card.highlight;
          const content = (
            <Card className={`${card.href ? "cursor-pointer transition-shadow hover:shadow-md" : ""} ${highlight ? "border-destructive/50 bg-destructive/5" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className={`h-4 w-4 ${highlight ? "text-destructive" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent className="pt-0">
                <div className={`text-2xl font-bold ${highlight ? "text-destructive" : ""}`}>{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
              </CardContent>
            </Card>
          );
          return card.href ? (
            <Link key={card.title} href={card.href}>{content}</Link>
          ) : (
            <div key={card.title}>{content}</div>
          );
        })}
      </div>

      {/* 기간 선택 + RAG 성능 섹션 */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">RAG 성능</h2>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {[
            { label: "7일", value: 7 },
            { label: "30일", value: 30 },
            { label: "90일", value: 90 },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                period === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {rag && (
        <div>

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
                  일별 대화 추이 ({period}일)
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

      {/* TOP 질문 섹션 */}
      {topQuestions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">
            TOP 질문 ({period}일)
          </h2>
          <Card className="mt-4">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">순위</th>
                      <th className="pb-2 pr-4 font-medium">질문</th>
                      <th className="pb-2 pr-4 font-medium">카테고리</th>
                      <th className="pb-2 text-right font-medium">매칭 횟수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topQuestions.map((q, idx) => (
                      <tr key={q.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="py-2 pr-4">{q.question}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {q.category || "미분류"}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {q.matchCount}건
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
