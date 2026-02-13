"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type SyncLog, type SyncResult } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const statusBadge: Record<string, { label: string; variant: "success" | "default" | "destructive" | "warning" }> = {
  running: { label: "실행 중", variant: "warning" },
  completed: { label: "완료", variant: "success" },
  failed: { label: "실패", variant: "destructive" },
};

export default function SettingsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState<string>("");
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    api.getCollectorLogs(20).then((res) => setLogs(res.data));
  }, []);

  async function handleSync(platform: "coupang" | "naver" | "cafe24") {
    setSyncing(platform);
    setLastResult(null);
    try {
      let result;
      if (platform === "coupang") {
        result = await api.syncCoupang();
      } else if (platform === "naver") {
        result = await api.syncNaver();
      } else {
        result = await api.syncCafe24();
      }
      setLastResult(result);
      // 로그 새로고침
      const res = await api.getCollectorLogs(20);
      setLogs(res.data);
    } catch {
      // API 키 미설정 등의 에러
    } finally {
      setSyncing("");
    }
  }

  function handleCafe24OAuth() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
    window.open(`${apiBase}/api/cafe24/oauth/start`, "_blank", "width=600,height=700");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>

      <div className="mt-4 grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>카테고리 관리</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              기본 카테고리: 배송, 교환/반품, 사용법, AS/수리, 결제, 기타
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              카테고리 커스터마이즈 기능은 추후 업데이트 예정입니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cafe24 쇼핑몰 연동</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cafe24 쇼핑몰과 연동하여 고객 매칭, 주문/배송 조회, Q&A 자동 수집이 가능합니다.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleCafe24OAuth}>
                Cafe24 연동하기
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>마켓플레이스 문의 수집</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              쿠팡/네이버/카페24 상품 문의를 수동으로 수집하거나, 매시간 자동 수집됩니다.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleSync("coupang")}
                disabled={syncing !== ""}
              >
                {syncing === "coupang" ? "수집 중..." : "쿠팡 수집"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSync("naver")}
                disabled={syncing !== ""}
              >
                {syncing === "naver" ? "수집 중..." : "네이버 수집"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSync("cafe24")}
                disabled={syncing !== ""}
              >
                {syncing === "cafe24" ? "수집 중..." : "카페24 수집"}
              </Button>
            </div>
            {lastResult && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p>조회: {lastResult.recordsFetched}건 / 신규 저장: {lastResult.recordsCreated}건</p>
                {lastResult.errors.length > 0 && (
                  <p className="mt-1 text-destructive">
                    오류: {lastResult.errors.join(", ")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>수집 로그</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">플랫폼</th>
                  <th className="px-4 py-3 font-medium">유형</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">조회/저장</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">시작</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 capitalize">{log.platform}</td>
                    <td className="px-4 py-3">
                      {log.syncType === "full" ? "전체" : "증분"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadge[log.status]?.variant || "default"}>
                        {statusBadge[log.status]?.label || log.status}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {log.recordsFetched}/{log.recordsCreated}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {formatDate(log.startedAt)}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      수집 로그가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API 연동 상태</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>OpenAI API</span>
              <span className="inline-flex items-center gap-1.5 text-green-600">
                <span className="h-2 w-2 rounded-full bg-green-600" />
                연결됨
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Neon PostgreSQL</span>
              <span className="inline-flex items-center gap-1.5 text-green-600">
                <span className="h-2 w-2 rounded-full bg-green-600" />
                연결됨
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>쿠팡 Open API</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                미설정
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>네이버 커머스 API</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                미설정
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cafe24 API</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                미설정
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
