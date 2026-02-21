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
