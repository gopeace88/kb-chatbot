"use client";

import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ingestApi, type QACandidate, type ApproveItem } from "@/lib/ingest-api";
import { CheckSquare, Square, Loader2, Save } from "lucide-react";

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
  onSaved: (count: number) => void;
}

export function QAReviewList({ candidates, jobId, onSaved }: QAReviewListProps) {
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

  const selectedCount = items.filter((it) => it.selected).length;
  const totalCount = items.length;

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

                  {/* Image preview */}
                  {item.editImageUrl && isValidImageUrl(item.editImageUrl) && (
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.editImageUrl}
                        alt="첨부 이미지"
                        className="max-h-32 rounded border border-border object-contain"
                      />
                    </div>
                  )}

                  {/* Image URL input */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      이미지 URL (선택)
                    </label>
                    <Input
                      value={item.editImageUrl}
                      onChange={(e) =>
                        updateField(item.id, "editImageUrl", e.target.value)
                      }
                      placeholder="https://..."
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
