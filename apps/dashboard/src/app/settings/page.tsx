"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
