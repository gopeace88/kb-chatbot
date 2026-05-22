"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { api, type KBItem, type QuestionVariant } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Check, Archive, Pencil, X, Upload, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

const categories = ["배송", "교환/반품", "사용법", "AS/수리", "결제", "기타"];
const statusBadge = {
  draft: { label: "초안", variant: "warning" as const },
  published: { label: "발행됨", variant: "success" as const },
  archived: { label: "보관됨", variant: "muted" as const },
};

export default function KBDetailPage() {
  return (
    <Suspense>
      <KBDetailContent />
    </Suspense>
  );
}

function KBDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const router = useRouter();
  const [item, setItem] = useState<KBItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [variants, setVariants] = useState<QuestionVariant[]>([]);
  const [variantInput, setVariantInput] = useState("");
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [generatingVariants, setGeneratingVariants] = useState(false);

  useEffect(() => {
    if (!id) { router.push("/kb"); return; }
    api.getKB(id).then((data) => {
      setItem(data);
      setQuestion(data.question);
      setAnswer(data.answer);
      setCategory(data.category || "");
      setImageUrl(data.imageUrl || "");
    }).catch(() => router.push("/kb"));
    fetchVariants(id);
  }, [id, router]);

  async function fetchVariants(kbId = id) {
    if (!kbId) return;
    setVariantsLoading(true);
    try {
      const res = await api.listKBVariants(kbId);
      setVariants(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "유사질문 조회 실패");
    } finally {
      setVariantsLoading(false);
    }
  }

  async function handleSave() {
    setLoading(true);
    setError("");
    try {
      const updated = await api.updateKB(id, {
        question,
        answer,
        category: category || undefined,
        imageUrl: imageUrl || null,
      });
      setItem(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateVariants() {
    setGeneratingVariants(true);
    setError("");
    try {
      const res = await api.generateKBVariants(id);
      setVariants(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "유사질문 생성 실패");
    } finally {
      setGeneratingVariants(false);
    }
  }

  async function handleAddVariant() {
    const text = variantInput.trim();
    if (!text) return;
    setError("");
    try {
      const created = await api.addKBVariant(id, text);
      if (created) setVariants((prev) => [...prev, created]);
      setVariantInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "유사질문 추가 실패");
    }
  }

  async function handleDeleteVariant(variantId: string) {
    if (!confirm("이 유사질문을 삭제하시겠습니까?")) return;
    try {
      await api.deleteKBVariant(id, variantId);
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "유사질문 삭제 실패");
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
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="이미지 크게 보기"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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
                <div>
                  <label className="mb-1 block text-sm font-medium">이미지</label>
                  <div className="flex gap-2">
                    <Input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/product.jpg"
                    />
                    <label className="flex cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      파일
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploading(true);
                          try {
                            const url = await api.uploadImage(file);
                            setImageUrl(url);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "업로드 실패");
                          } finally {
                            setUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  </div>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(imageUrl)}
                      className="mt-2 cursor-zoom-in"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="미리보기" className="max-h-40 rounded border transition-opacity hover:opacity-80" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={loading}>
                    {loading ? "저장 중..." : "저장"}
                  </Button>
                  <Button variant="outline" onClick={() => { setEditing(false); setQuestion(item.question); setAnswer(item.answer); setCategory(item.category || ""); setImageUrl(item.imageUrl || ""); }}>
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
                {item.imageUrl && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">이미지</div>
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(item.imageUrl!)}
                      className="group relative mt-1 cursor-zoom-in"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt="KB 이미지" className="max-h-48 rounded border transition-opacity group-hover:opacity-80" />
                      <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                        크게 보기
                      </span>
                    </button>
                  </div>
                )}
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

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>검색용 유사질문</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                고객이 다르게 물어봐도 이 Q&A 답변으로 매칭되도록 쓰는 질문들입니다.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateVariants}
              disabled={generatingVariants}
            >
              {generatingVariants ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              재생성
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={variantInput}
              onChange={(e) => setVariantInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddVariant();
                }
              }}
              placeholder="예: 이거 몇 그램이에요?"
            />
            <Button onClick={handleAddVariant} disabled={!variantInput.trim()}>
              <Plus className="h-4 w-4" />
              추가
            </Button>
          </div>

          {variantsLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              유사질문을 불러오는 중...
            </div>
          ) : variants.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              아직 등록된 유사질문이 없습니다. 재생성을 누르거나 직접 추가하세요.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-gray-900">{variant.question}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {variant.source === "ai_generated" ? "AI 생성" : "수동 추가"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteVariant(variant.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
