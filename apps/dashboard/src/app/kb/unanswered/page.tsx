"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type UnansweredQuestion } from "@/lib/api";
import { AlertCircle, Plus, X, Loader2, CheckCircle2 } from "lucide-react";

export default function UnansweredPage() {
  const [questions, setQuestions] = useState<UnansweredQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [formData, setFormData] = useState({ question: "", answer: "", category: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUnansweredQuestions(days);
      setQuestions(res.data);
    } catch (e) {
      console.error("Failed to fetch unanswered questions:", e);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExpand = (idx: number, question: string) => {
    if (expandedIdx === idx) {
      setExpandedIdx(null);
      return;
    }
    setExpandedIdx(idx);
    setFormData({ question, answer: "", category: "" });
  };

  const handleSave = async () => {
    if (!formData.answer.trim()) return;
    setSaving(true);
    try {
      const newItem = await api.createKB({
        question: formData.question,
        answer: formData.answer,
        category: formData.category || undefined,
      });
      await api.publishKB(newItem.id);
      setQuestions((prev) => prev.filter((_, i) => i !== expandedIdx));
      setExpandedIdx(null);
    } catch (e) {
      console.error("Failed to create KB item:", e);
      alert("KB 등록에 실패했습니다.");
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
          <h1 className="text-2xl font-bold text-gray-900">미답변 질문</h1>
          <p className="mt-1 text-sm text-gray-500">
            봇이 답변하지 못한 질문을 확인하고, KB에 등록하여 자동 답변을 강화하세요.
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
      ) : questions.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">미답변 질문이 없습니다</h3>
          <p className="mt-2 text-sm text-gray-500">모든 질문에 잘 답변하고 있어요!</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white">
          <div className="border-b border-border px-6 py-3">
            <span className="text-sm font-medium text-gray-500">
              총 {questions.length}개의 미답변 질문
            </span>
          </div>
          <div className="divide-y divide-border">
            {questions.map((q, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{q.userMessage}</p>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {q.count}회 문의
                      </span>
                      <span>마지막: {new Date(q.lastAsked).toLocaleDateString("ko-KR")}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleExpand(idx, q.userMessage)}
                    className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      expandedIdx === idx
                        ? "bg-gray-100 text-gray-700"
                        : "bg-primary text-white hover:bg-primary/90"
                    }`}
                  >
                    {expandedIdx === idx ? (
                      <>
                        <X className="h-4 w-4" />
                        취소
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        KB 등록
                      </>
                    )}
                  </button>
                </div>

                {expandedIdx === idx && (
                  <div className="border-t border-border bg-gray-50 px-6 py-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">질문</label>
                        <input
                          type="text"
                          value={formData.question}
                          onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">답변</label>
                        <textarea
                          value={formData.answer}
                          onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                          rows={4}
                          placeholder="이 질문에 대한 답변을 작성하세요..."
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">카테고리 (선택)</label>
                        <input
                          type="text"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          placeholder="예: 배송, AS, 사용법"
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setExpandedIdx(null)}
                          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          취소
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving || !formData.answer.trim()}
                          className="flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              저장 중...
                            </>
                          ) : (
                            "KB에 등록 (발행)"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
