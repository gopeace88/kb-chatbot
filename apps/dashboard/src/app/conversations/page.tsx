"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type Conversation, type PaginatedResponse } from "@/lib/api";
import { formatDate, truncate } from "@/lib/utils";
import Link from "next/link";

const sourceBadge: Record<string, { label: string; variant: "success" | "default" | "destructive" }> = {
  kb_match: { label: "KB 매칭", variant: "success" },
  ai_generated: { label: "AI 생성", variant: "default" },
  fallback: { label: "폴백", variant: "destructive" },
};

export default function ConversationsPage() {
  return (
    <Suspense>
      <ConversationsContent />
    </Suspense>
  );
}

function ConversationsContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<Conversation> | null>(null);
  const page = Number(searchParams.get("page") || "1");

  useEffect(() => {
    api.listConversations({ page }).then(setData);
  }, [page]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">대화 로그</h1>

      <Card className="mt-4">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="hidden px-4 py-3 font-medium lg:table-cell">사용자</th>
                <th className="px-4 py-3 font-medium">사용자 메시지</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">봇 응답</th>
                <th className="px-4 py-3 font-medium">소스</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">유사도</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">피드백</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">시간</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((conv) => (
                <tr key={conv.id} className="border-b border-border last:border-0">
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <Link
                      href={`/customers/${conv.kakaoUserId}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {conv.kakaoUserId.slice(0, 10)}...
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {truncate(conv.userMessage, 50)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground md:hidden">
                      {truncate(conv.botResponse, 60)}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {truncate(conv.botResponse, 60)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={sourceBadge[conv.responseSource]?.variant || "muted"}>
                      {sourceBadge[conv.responseSource]?.label || conv.responseSource}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {conv.similarityScore
                      ? `${Math.round(conv.similarityScore * 100)}%`
                      : "-"}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {conv.wasHelpful === true
                      ? "👍"
                      : conv.wasHelpful === false
                        ? "👎"
                        : "-"}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {formatDate(conv.createdAt)}
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    대화 로그가 없습니다.
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
            <Link key={i} href={`/conversations?page=${i + 1}`}>
              <Button variant={page === i + 1 ? "default" : "outline"} size="sm">
                {i + 1}
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
