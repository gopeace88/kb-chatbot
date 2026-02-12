"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type DashboardStats } from "@/lib/api";
import {
  BookOpen,
  MessageSquare,
  MessagesSquare,
  TrendingUp,
} from "lucide-react";

export default function DashboardHome() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getDashboardStats().then(setStats).catch((e) => setError(e.message));
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
    </div>
  );
}
