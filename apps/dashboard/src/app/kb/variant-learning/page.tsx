"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { api, type VariantLearningLog } from "@/lib/api";
import { cn } from "@/lib/utils";

const filters = [
  { value: "all", label: "전체" },
  { value: "inserted", label: "추가됨" },
  { value: "rejected", label: "거절" },
  { value: "skipped", label: "건너뜀" },
  { value: "removed", label: "삭제됨" },
];

function decisionLabel(decision: string) {
  if (decision === "inserted") return "추가됨";
  if (decision === "rejected") return "거절";
  if (decision === "skipped") return "건너뜀";
  if (decision === "removed") return "삭제됨";
  return decision;
}

function decisionClass(decision: string) {
  if (decision === "inserted") return "bg-emerald-50 text-emerald-700";
  if (decision === "rejected") return "bg-amber-50 text-amber-700";
  if (decision === "removed") return "bg-red-50 text-red-700";
  return "bg-gray-100 text-gray-700";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VariantLearningPage() {
  const [logs, setLogs] = useState<VariantLearningLog[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listVariantLearningLogs({ decision: filter });
      setLogs(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const removeVariant = async (log: VariantLearningLog) => {
    if (!log.knowledgeQuestionVariantId) return;
    if (!confirm("이 자동 학습 유사질문을 검색 대상에서 삭제할까요?")) return;

    setBusyId(log.id);
    try {
      await api.deleteLearnedVariantFromLog(log.id);
      await loadLogs();
    } catch (e) {
      alert(e instanceof Error ? e.message : "유사질문 삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteLog = async (id: string) => {
    if (!confirm("이 로그만 삭제할까요? 등록된 유사질문은 유지됩니다.")) return;

    setBusyId(id);
    try {
      await api.deleteVariantLearningLog(id);
      setLogs((prev) => prev.filter((log) => log.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "로그 삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">유사질문 학습</h1>
          <p className="mt-1 text-sm text-gray-500">
            매일 자동으로 판단한 질문 변형 추가 내역을 확인합니다.
          </p>
        </div>
        <button
          onClick={() => loadLogs()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          새로고침
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              filter === item.value
                ? "bg-primary text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">상태</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">사용자 질문</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">학습 유사질문</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">연결 KB</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">근거</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  불러오는 중입니다.
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  학습 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="align-top hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", decisionClass(log.decision))}>
                      {decisionLabel(log.decision)}
                    </span>
                    <div className="mt-2 text-xs text-gray-400">{formatDate(log.createdAt)}</div>
                  </td>
                  <td className="max-w-xs px-4 py-4 text-sm text-gray-900">
                    <div className="font-medium">{log.userMessage}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {log.sourceCount}회 질문 · 최근 {formatDate(log.lastAskedAt)}
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-4 text-sm text-gray-700">
                    {log.variantQuestion || log.suggestedQuestion || "-"}
                  </td>
                  <td className="max-w-xs px-4 py-4 text-sm text-gray-700">
                    {log.kbQuestion || "-"}
                    {log.knowledgeItemId && (
                      <Link
                        href={`/kb/detail?id=${log.knowledgeItemId}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        KB 열기 <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-4 text-sm text-gray-600">
                    <div>{log.reason || "-"}</div>
                    {log.similarity !== null && (
                      <div className="mt-1 text-xs text-gray-400">유사도 {log.similarity.toFixed(3)}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {log.knowledgeQuestionVariantId && log.decision !== "removed" && (
                        <button
                          onClick={() => removeVariant(log)}
                          disabled={busyId === log.id}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="유사질문 삭제"
                        >
                          {busyId === log.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => deleteLog(log.id)}
                        disabled={busyId === log.id}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                      >
                        로그 삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
