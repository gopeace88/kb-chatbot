"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, type Inquiry, type PaginatedResponse } from "@/lib/api";
import { formatDate, truncate } from "@/lib/utils";
import Link from "next/link";

const statusBadge: Record<string, { label: string; variant: "default" | "success" | "warning" | "muted" | "destructive" }> = {
  new: { label: "신규", variant: "default" },
  answered: { label: "답변됨", variant: "success" },
  refined: { label: "정제됨", variant: "warning" },
  published: { label: "발행됨", variant: "success" },
  ignored: { label: "무시됨", variant: "muted" },
};

const channelLabel: Record<string, string> = {
  kakao: "카카오톡",
  coupang: "쿠팡",
  naver: "네이버",
  manual: "수동",
};

export default function InquiriesPage() {
  return (
    <Suspense>
      <InquiriesContent />
    </Suspense>
  );
}

function InquiriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<Inquiry> | null>(null);
  const [channel, setChannel] = useState(searchParams.get("channel") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");

  const page = Number(searchParams.get("page") || "1");

  useEffect(() => {
    api
      .listInquiries({
        page,
        channel: channel || undefined,
        status: status || undefined,
      })
      .then(setData);
  }, [page, channel, status]);

  function applyFilter() {
    const qs = new URLSearchParams();
    if (channel) qs.set("channel", channel);
    if (status) qs.set("status", status);
    router.push(`/inquiries?${qs}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">문의 관리</h1>

      <div className="mt-4 flex gap-3">
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-32">
          <option value="">전체 채널</option>
          <option value="kakao">카카오톡</option>
          <option value="coupang">쿠팡</option>
          <option value="naver">네이버</option>
          <option value="manual">수동</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-32">
          <option value="">전체 상태</option>
          <option value="new">신규</option>
          <option value="answered">답변됨</option>
          <option value="refined">정제됨</option>
          <option value="published">발행됨</option>
        </Select>
        <Button variant="outline" onClick={applyFilter}>필터 적용</Button>
      </div>

      <Card className="mt-4">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">질문</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">채널</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">접수일</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  onClick={() => router.push(`/inquiries/${item.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {truncate(item.questionText, 60)}
                    </div>
                    {item.answerText && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        답변: {truncate(item.answerText, 80)}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {channelLabel[item.channel] || item.channel}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadge[item.status]?.variant || "muted"}>
                      {statusBadge[item.status]?.label || item.status}
                    </Badge>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {formatDate(item.receivedAt)}
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    문의가 없습니다.
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
            <Link key={i} href={`/inquiries?page=${i + 1}${channel ? `&channel=${channel}` : ""}${status ? `&status=${status}` : ""}`}>
              <Button variant={page === i + 1 ? "default" : "outline"} size="sm">
                {i + 1}
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
