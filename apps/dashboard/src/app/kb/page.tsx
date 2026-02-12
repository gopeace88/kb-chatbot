"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, type KBItem, type PaginatedResponse } from "@/lib/api";
import { formatDate, truncate } from "@/lib/utils";
import { Plus, Search } from "lucide-react";

const statusBadge = {
  draft: { label: "초안", variant: "warning" as const },
  published: { label: "발행됨", variant: "success" as const },
  archived: { label: "보관됨", variant: "muted" as const },
};

export default function KBListPage() {
  return (
    <Suspense>
      <KBListContent />
    </Suspense>
  );
}

function KBListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<KBItem> | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");

  const page = Number(searchParams.get("page") || "1");

  useEffect(() => {
    api
      .listKB({
        page,
        status: status || undefined,
        search: search || undefined,
      })
      .then(setData);
  }, [page, status, search]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    router.push(`/kb?${qs}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">지식 베이스</h1>
        <Link href="/kb/new">
          <Button>
            <Plus className="h-4 w-4" />
            새 Q&A
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mt-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="질문 또는 답변 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-32"
        >
          <option value="">전체 상태</option>
          <option value="draft">초안</option>
          <option value="published">발행됨</option>
          <option value="archived">보관됨</option>
        </Select>
        <Button type="submit" variant="outline">
          검색
        </Button>
      </form>

      <Card className="mt-4">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">질문</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">카테고리</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">사용</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">수정일</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  onClick={() => router.push(`/kb/${item.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {truncate(item.question, 60)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {truncate(item.answer, 80)}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {item.category || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadge[item.status].variant}>
                      {statusBadge[item.status].label}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {item.usageCount}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {formatDate(item.updatedAt)}
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    등록된 Q&A가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: data.totalPages }, (_, i) => (
            <Link key={i} href={`/kb?page=${i + 1}${status ? `&status=${status}` : ""}${search ? `&search=${search}` : ""}`}>
              <Button
                variant={page === i + 1 ? "default" : "outline"}
                size="sm"
              >
                {i + 1}
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
