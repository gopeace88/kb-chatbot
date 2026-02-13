"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ingestApi, type QACandidate, type ApproveItem } from "@/lib/ingest-api";
import { CheckSquare, Square, Loader2, Save, X, ImageIcon, Trash2, ChevronLeft, ChevronRight, Check, AlertCircle } from "lucide-react";

function isValidImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const CATEGORIES = [
  "일반",
  "제품",
  "배송",
  "교환/반품",
  "결제",
  "AS/수리",
  "사용방법",
  "기타",
];

interface EditableCandidate extends QACandidate {
  editQuestion: string;
  editAnswer: string;
  editCategory: string;
  editImageUrl: string;
  selected: boolean;
}

interface QAReviewListProps {
  candidates: QACandidate[];
  jobId: string;
  availableImages?: Record<string, string>;
  onSaved: (count: number) => void;
}

// ---------------------------------------------------------------------------
// Lightbox — full-screen image viewer (view only)
// ---------------------------------------------------------------------------

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="이미지 크게 보기"
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageGalleryPicker — full-screen gallery with left/right + select button
// ---------------------------------------------------------------------------

function ImageGalleryPicker({
  images,
  currentUrl,
  initialIndex,
  onSelect,
  onClose,
}: {
  images: Array<{ key: string; url: string }>;
  currentUrl: string;
  initialIndex: number;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  const goPrev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const goNext = useCallback(() => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "Enter") {
        onSelect(images[index].url);
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext, onSelect, images, index]);

  const current = images[index];
  const isSelected = current.url === currentUrl;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm text-white/80">
          {current.key} — {index + 1} / {images.length}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { onSelect(current.url); onClose(); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              isSelected
                ? "bg-green-500 text-white"
                : "bg-white text-gray-900 hover:bg-gray-100",
            )}
          >
            <Check className="h-4 w-4" />
            {isSelected ? "선택됨" : "이 이미지 선택"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {/* Left arrow */}
        <button
          type="button"
          onClick={goPrev}
          className="flex-shrink-0 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 mx-4"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        {/* Main image */}
        <div className="flex-1 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.key}
            className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>

        {/* Right arrow */}
        <button
          type="button"
          onClick={goNext}
          className="flex-shrink-0 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 mx-4"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>

      {/* Bottom thumbnails */}
      <div className="flex justify-center gap-1.5 overflow-x-auto px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {images.map((img, i) => (
          <button
            key={img.key}
            type="button"
            onClick={() => setIndex(i)}
            className={cn(
              "relative h-14 w-14 flex-shrink-0 overflow-hidden rounded border-2 transition-all",
              i === index ? "border-white ring-2 ring-white/50" : "border-white/20 opacity-60 hover:opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.key} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QAReviewList({ candidates, jobId, availableImages, onSaved }: QAReviewListProps) {
  const [items, setItems] = useState<EditableCandidate[]>(() =>
    candidates.map((c) => ({
      ...c,
      editQuestion: c.question,
      editAnswer: c.answer,
      editCategory: c.category,
      editImageUrl: c.imageUrl || "",
      selected: !c.isDuplicate,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [galleryForItem, setGalleryForItem] = useState<string | null>(null); // item id

  const selectedCount = items.filter((it) => it.selected).length;
  const totalCount = items.length;
  const imageEntries = availableImages
    ? Object.entries(availableImages).map(([key, url]) => ({ key, url }))
    : [];
  const hasAvailableImages = imageEntries.length > 0;

  const toggleSelect = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, selected: !it.selected } : it,
      ),
    );
  }, []);

  const selectAll = useCallback(() => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: false })));
  }, []);

  const selectNonDuplicates = useCallback(() => {
    setItems((prev) =>
      prev.map((it) => ({ ...it, selected: !it.isDuplicate })),
    );
  }, []);

  const updateField = useCallback(
    (id: string, field: "editQuestion" | "editAnswer" | "editCategory" | "editImageUrl", value: string) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
      );
    },
    [],
  );

  const clearImage = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, editImageUrl: "" } : it)),
    );
  }, []);

  const handleSave = useCallback(async () => {
    const selected = items.filter((it) => it.selected);
    if (selected.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const approveItems: ApproveItem[] = selected.map((it) => ({
        id: it.id,
        question: it.editQuestion,
        answer: it.editAnswer,
        category: it.editCategory,
        imageUrl: it.editImageUrl || undefined,
      }));

      const result = await ingestApi.approve(jobId, approveItems);
      onSaved(result.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }, [items, jobId, onSaved]);

  return (
    <div className="space-y-4">
      {/* Lightbox */}
      {lightboxUrl && (
        <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={selectAll}>
          전체 선택
        </Button>
        <Button variant="outline" size="sm" onClick={deselectAll}>
          전체 해제
        </Button>
        <Button variant="outline" size="sm" onClick={selectNonDuplicates}>
          비중복만 선택
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {selectedCount}/{totalCount} 선택됨
        </span>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8">
            <AlertCircle className="h-8 w-8 text-yellow-500" />
            <p className="text-sm text-muted-foreground">
              생성된 Q&A가 없습니다. 파일 내용이 충분한지 확인하고, 서버 로그를 확인해주세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Candidate cards */}
      <div className="space-y-3">
        {items.map((item) => (
          <Card
            key={item.id}
            className={cn(
              item.isDuplicate && "border-yellow-300 bg-yellow-50/50",
            )}
          >
            <CardContent className="p-4">
              <div className="flex gap-3">
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleSelect(item.id)}
                  className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-primary"
                >
                  {item.selected ? (
                    <CheckSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-3">
                  {/* Header row: file name + badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {item.fileName} (청크 #{item.chunkIndex + 1})
                    </span>
                    {item.isDuplicate && (
                      <Badge variant="warning">중복</Badge>
                    )}
                  </div>

                  {/* Duplicate info */}
                  {item.isDuplicate && item.duplicateOf && (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs">
                      <p className="font-medium text-yellow-800">
                        기존 Q&A와 유사 (유사도: {(item.duplicateOf.similarity * 100).toFixed(1)}%)
                      </p>
                      <p className="mt-0.5 text-yellow-700">
                        기존 질문: {item.duplicateOf.question}
                      </p>
                    </div>
                  )}

                  {/* Editable question */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      질문
                    </label>
                    <Input
                      value={item.editQuestion}
                      onChange={(e) =>
                        updateField(item.id, "editQuestion", e.target.value)
                      }
                    />
                  </div>

                  {/* Editable answer */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      답변
                    </label>
                    <Textarea
                      value={item.editAnswer}
                      onChange={(e) =>
                        updateField(item.id, "editAnswer", e.target.value)
                      }
                      rows={3}
                    />
                  </div>

                  {/* Editable category */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      카테고리
                    </label>
                    <Select
                      value={item.editCategory}
                      onChange={(e) =>
                        updateField(item.id, "editCategory", e.target.value)
                      }
                      className="w-48"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* Image section */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      이미지
                    </label>

                    {/* Current image preview (clickable for lightbox) + delete */}
                    {item.editImageUrl && isValidImageUrl(item.editImageUrl) && (
                      <div className="mb-2 flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(item.editImageUrl)}
                          className="group relative flex-shrink-0 cursor-zoom-in overflow-hidden rounded border border-border transition-shadow hover:shadow-md"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.editImageUrl}
                            alt="첨부 이미지"
                            className="max-h-32 object-contain"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                            <span className="rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                              크게 보기
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => clearImage(item.id)}
                          title="이미지 삭제"
                          className="mt-1 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {/* Open gallery picker button */}
                    {hasAvailableImages && (
                      <div className="mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGalleryForItem(item.id)}
                          className="gap-1.5"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          페이지 이미지에서 선택 ({imageEntries.length}장)
                        </Button>
                      </div>
                    )}

                    {/* Gallery picker overlay */}
                    {galleryForItem === item.id && hasAvailableImages && (
                      <ImageGalleryPicker
                        images={imageEntries}
                        currentUrl={item.editImageUrl}
                        initialIndex={
                          Math.max(0, imageEntries.findIndex((e) => e.url === item.editImageUrl))
                        }
                        onSelect={(url) =>
                          updateField(item.id, "editImageUrl", url)
                        }
                        onClose={() => setGalleryForItem(null)}
                      />
                    )}

                    {/* Image URL input */}
                    <Input
                      value={item.editImageUrl}
                      onChange={(e) =>
                        updateField(item.id, "editImageUrl", e.target.value)
                      }
                      placeholder="https://... 또는 위에서 페이지 이미지 선택"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selectedCount}개 항목이 지식 베이스에 저장됩니다.
        </span>
        <Button
          onClick={handleSave}
          disabled={selectedCount === 0 || saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              선택 항목 저장
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
