"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { api, type KBItem } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Check, Archive, Pencil } from "lucide-react";

const categories = ["배송", "교환/반품", "사용법", "AS/수리", "결제", "기타"];
const statusBadge = {
  draft: { label: "초안", variant: "warning" as const },
  published: { label: "발행됨", variant: "success" as const },
  archived: { label: "보관됨", variant: "muted" as const },
};

export default function KBDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<KBItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getKB(id).then((data) => {
      setItem(data);
      setQuestion(data.question);
      setAnswer(data.answer);
      setCategory(data.category || "");
    }).catch(() => router.push("/kb"));
  }, [id, router]);

  async function handleSave() {
    setLoading(true);
    setError("");
    try {
      const updated = await api.updateKB(id, {
        question,
        answer,
        category: category || undefined,
      });
      setItem(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish() {
    try {
      const updated = await api.publishKB(id);
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "발행 실패");
    }
  }

  async function handleArchive() {
    try {
      const updated = await api.archiveKB(id);
      setItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "보관 실패");
    }
  }

  if (!item) return <div className="py-8 text-center text-muted-foreground">로딩 중...</div>;

  return (
    <div>
      <Link href="/kb" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        목록으로
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Q&A 상세</h1>
          <Badge variant={statusBadge[item.status].variant}>
            {statusBadge[item.status].label}
          </Badge>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              편집
            </Button>
          )}
          {item.status === "draft" && (
            <Button size="sm" onClick={handlePublish}>
              <Check className="h-4 w-4" />
              발행
            </Button>
          )}
          {item.status !== "archived" && (
            <Button variant="outline" size="sm" onClick={handleArchive}>
              <Archive className="h-4 w-4" />
              보관
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>질문 & 답변</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">질문</label>
                  <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">답변</label>
                  <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">카테고리</label>
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">선택 안 함</option>
                    {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={loading}>
                    {loading ? "저장 중..." : "저장"}
                  </Button>
                  <Button variant="outline" onClick={() => { setEditing(false); setQuestion(item.question); setAnswer(item.answer); setCategory(item.category || ""); }}>
                    취소
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">질문</div>
                  <p className="mt-1 whitespace-pre-wrap text-gray-900">{item.question}</p>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">답변</div>
                  <p className="mt-1 whitespace-pre-wrap text-gray-900">{item.answer}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">카테고리</span>
              <span>{item.category || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">사용 횟수</span>
              <span>{item.usageCount}회</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">도움됨</span>
              <span>{item.helpfulCount}회</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">생성자</span>
              <span>{item.createdBy || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">확인자</span>
              <span>{item.confirmedBy || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">생성일</span>
              <span>{formatDate(item.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">수정일</span>
              <span>{formatDate(item.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
