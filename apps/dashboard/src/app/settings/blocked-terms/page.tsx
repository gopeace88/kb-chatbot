"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, type BlockedTerm } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Shield, Plus, Trash2 } from "lucide-react";

const matchTypeLabel: Record<string, { label: string; variant: "default" | "success" | "warning" }> = {
  contains: { label: "포함", variant: "default" },
  exact: { label: "일치", variant: "success" },
  regex: { label: "정규식", variant: "warning" },
};

export default function BlockedTermsPage() {
  const [terms, setTerms] = useState<BlockedTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState("contains");
  const [reason, setReason] = useState("");

  async function loadTerms() {
    try {
      const result = await api.listBlockedTerms();
      setTerms(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록 로딩 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTerms();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const created = await api.createBlockedTerm({
        pattern: pattern.trim(),
        matchType,
        reason: reason.trim() || undefined,
      });
      setTerms((prev) => [created, ...prev]);
      setPattern("");
      setReason("");
      setMatchType("contains");
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, termPattern: string) {
    if (!window.confirm(`"${termPattern}" 패턴을 삭제하시겠습니까?`)) return;
    setError("");
    try {
      await api.deleteBlockedTerm(id);
      setTerms((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">차단 패턴 관리</h1>
          <p className="text-sm text-muted-foreground">
            자동 답변에서 차단할 문구 패턴을 관리합니다. 등록된 패턴이 포함된 문의는 자동으로 무시됩니다.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* Add form */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>새 차단 패턴 추가</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-sm font-medium text-muted-foreground">패턴</label>
              <Input
                placeholder="차단할 문구를 입력하세요..."
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                required
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block text-sm font-medium text-muted-foreground">매칭 방식</label>
              <Select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
              >
                <option value="contains">포함</option>
                <option value="exact">일치</option>
                <option value="regex">정규식</option>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="mb-1 block text-sm font-medium text-muted-foreground">사유 (선택)</label>
              <Input
                placeholder="차단 사유..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting || !pattern.trim()}>
              <Plus className="h-4 w-4" />
              {submitting ? "추가 중..." : "추가"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Terms table */}
      <Card className="mt-4">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">패턴</th>
                <th className="px-4 py-3 font-medium">매칭 방식</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">사유</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">등록일</th>
                <th className="px-4 py-3 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    로딩 중...
                  </td>
                </tr>
              ) : terms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    등록된 차단 패턴이 없습니다.
                  </td>
                </tr>
              ) : (
                terms.map((term) => {
                  const mt = matchTypeLabel[term.matchType] || matchTypeLabel.contains;
                  return (
                    <tr
                      key={term.id}
                      className="border-b border-border last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 font-mono text-gray-900">{term.pattern}</td>
                      <td className="px-4 py-3">
                        <Badge variant={mt.variant}>{mt.label}</Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                        {term.reason || "-"}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {formatDate(term.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(term.id, term.pattern)}
                          className="text-destructive hover:bg-red-50 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
