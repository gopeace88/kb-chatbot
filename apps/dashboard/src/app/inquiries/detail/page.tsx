"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api, type Inquiry } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Sparkles, Upload } from "lucide-react";

const channelLabel: Record<string, string> = {
  kakao: "카카오톡",
  coupang: "쿠팡",
  naver: "네이버",
  cafe24: "카페24",
  manual: "수동",
};

export default function InquiryDetailPage() {
  return (
    <Suspense>
      <InquiryDetailContent />
    </Suspense>
  );
}

function InquiryDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const router = useRouter();
  const [item, setItem] = useState<Inquiry | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { router.push("/inquiries"); return; }
    api.getInquiry(id).then((data) => {
      setItem(data);
      setAnswerText(data.answerText || "");
    }).catch(() => router.push("/inquiries"));
  }, [id, router]);

  async function handleAnswer() {
    if (!answerText.trim()) return;
    setLoading("answer");
    setError("");
    try {
      const updated = await api.answerInquiry(id, answerText);
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "답변 실패");
    } finally {
      setLoading("");
    }
  }

  async function handleRefine() {
    setLoading("refine");
    setError("");
    try {
      await api.refineInquiry(id);
      const updated = await api.getInquiry(id);
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "정제 실패");
    } finally {
      setLoading("");
    }
  }

  async function handlePublish() {
    setLoading("publish");
    setError("");
    try {
      await api.publishInquiry(id);
      const updated = await api.getInquiry(id);
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "발행 실패");
    } finally {
      setLoading("");
    }
  }

  if (!item) return <div className="py-8 text-center text-muted-foreground">로딩 중...</div>;

  return (
    <div>
      <Link href="/inquiries" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        목록으로
      </Link>

      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">문의 상세</h1>
        <Badge variant={item.status === "new" ? "default" : "success"}>
          {item.status}
        </Badge>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>문의 내용</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">원본 질문</div>
              <p className="mt-1 whitespace-pre-wrap text-gray-900">{item.questionText}</p>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">답변</div>
              {item.status === "new" ? (
                <div className="mt-1 space-y-2">
                  <Textarea
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="답변을 입력하세요..."
                    rows={4}
                  />
                  <Button onClick={handleAnswer} disabled={loading === "answer"}>
                    {loading === "answer" ? "저장 중..." : "답변 저장"}
                  </Button>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-gray-900">
                  {item.answerText || "-"}
                </p>
              )}
            </div>

            {item.aiSummary && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">AI 요약</div>
                <p className="mt-1 text-gray-900">{item.aiSummary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">채널</span>
                <span>{channelLabel[item.channel]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">고객</span>
                <span>{item.customerName || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">AI 카테고리</span>
                <span>{item.aiCategory || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">접수일</span>
                <span>{formatDate(item.receivedAt)}</span>
              </div>
              {item.answeredAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">답변일</span>
                  <span>{formatDate(item.answeredAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>작업</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {item.answerText && item.status === "answered" && (
                <Button className="w-full" onClick={handleRefine} disabled={loading === "refine"}>
                  <Sparkles className="h-4 w-4" />
                  {loading === "refine" ? "정제 중..." : "AI Q&A 정제"}
                </Button>
              )}
              {item.knowledgeItemId && item.status === "refined" && (
                <Button className="w-full" onClick={handlePublish} disabled={loading === "publish"}>
                  <Upload className="h-4 w-4" />
                  {loading === "publish" ? "발행 중..." : "KB에 발행"}
                </Button>
              )}
              {item.knowledgeItemId && (
                <Link href={`/kb/detail?id=${item.knowledgeItemId}`}>
                  <Button variant="outline" className="w-full">
                    연결된 KB 보기
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
