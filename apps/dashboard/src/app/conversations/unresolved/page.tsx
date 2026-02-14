"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type Conversation, type PaginatedResponse } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  Send,
  X,
  Loader2,
  CheckCircle2,
  Plus,
  User,
} from "lucide-react";

export default function UnresolvedPage() {
  const [data, setData] = useState<PaginatedResponse<Conversation> | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [agentResponse, setAgentResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [alsoCreateKB, setAlsoCreateKB] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listUnresolved({ days });
      setData(res);
    } catch (e) {
      console.error("Failed to fetch unresolved:", e);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setAgentResponse("");
    setAlsoCreateKB(false);
  };

  const handleResolve = async (conv: Conversation) => {
    if (!agentResponse.trim()) return;
    setSaving(true);
    try {
      await api.resolveConversation(conv.id, agentResponse);

      if (alsoCreateKB) {
        const newItem = await api.createKB({
          question: conv.userMessage,
          answer: agentResponse,
        });
        await api.publishKB(newItem.id);
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              data: prev.data.filter((c) => c.id !== conv.id),
              total: prev.total - 1,
            }
          : null,
      );
      setExpandedId(null);
    } catch (e) {
      console.error("Failed to resolve:", e);
      alert("답변 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const periodOptions = [
    { label: "7일", value: 7 },
    { label: "30일", value: 30 },
    { label: "90일", value: 90 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">미해결 문의</h1>
          <p className="mt-1 text-sm text-gray-500">
            봇이 답변하지 못한 문의를 확인하고 직접 답변하세요. 답변은 나중에
            알림톡으로 전송됩니다.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                days === opt.value
                  ? "bg-primary text-white"
                  : "text-gray-600 hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-gray-500">로딩 중...</span>
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            미해결 문의가 없습니다
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            모든 문의가 처리되었습니다.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-white px-6 py-3">
            <span className="text-sm font-medium text-gray-500">
              총 {data.total}건의 미해결 문의
            </span>
          </div>

          <div className="space-y-3">
            {data.data.map((conv) => (
              <Card key={conv.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Link
                          href={`/customers/${conv.kakaoUserId}`}
                          className="flex items-center gap-1 font-mono text-primary hover:underline"
                        >
                          <User className="h-3 w-3" />
                          {conv.kakaoUserId.slice(0, 10)}...
                        </Link>
                        <span>{formatDate(conv.createdAt)}</span>
                      </div>
                      <div className="mt-2 rounded-lg bg-blue-50 p-3">
                        <p className="text-sm text-gray-900">
                          {conv.userMessage}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="destructive">폴백</Badge>
                        <span className="text-xs text-gray-400">
                          봇 응답: {conv.botResponse.slice(0, 50)}...
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleExpand(conv.id)}
                      className={`ml-4 flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        expandedId === conv.id
                          ? "bg-gray-100 text-gray-700"
                          : "bg-primary text-white hover:bg-primary/90"
                      }`}
                    >
                      {expandedId === conv.id ? (
                        <>
                          <X className="h-4 w-4" />
                          취소
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          답변하기
                        </>
                      )}
                    </button>
                  </div>

                  {expandedId === conv.id && (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            상담사 답변
                          </label>
                          <textarea
                            value={agentResponse}
                            onChange={(e) => setAgentResponse(e.target.value)}
                            rows={4}
                            placeholder="고객에게 보낼 답변을 작성하세요..."
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`kb-${conv.id}`}
                            checked={alsoCreateKB}
                            onChange={(e) => setAlsoCreateKB(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <label
                            htmlFor={`kb-${conv.id}`}
                            className="flex items-center gap-1 text-sm text-gray-600"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            KB에도 등록 (다음에 같은 질문이 오면 자동 답변)
                          </label>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedId(null)}
                          >
                            취소
                          </Button>
                          <Button
                            size="sm"
                            disabled={saving || !agentResponse.trim()}
                            onClick={() => handleResolve(conv)}
                          >
                            {saving ? (
                              <>
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                저장 중...
                              </>
                            ) : (
                              "답변 저장"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
