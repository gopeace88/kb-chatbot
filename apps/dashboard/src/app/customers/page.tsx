"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  api,
  type CustomerLink,
  type CustomerStats,
  type PaginatedResponse,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Users, Link2, UserPlus } from "lucide-react";

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersContent />
    </Suspense>
  );
}

function CustomersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") || "1");

  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [data, setData] = useState<PaginatedResponse<CustomerLink> | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCustomerStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    api.listCustomers({ page }).then(setData).catch((e) => setError(e.message));
  }, [page]);

  const statCards = [
    {
      title: "총 고객",
      value: stats?.totalCustomers ?? "-",
      icon: Users,
    },
    {
      title: "Cafe24 연결됨",
      value: stats?.linkedCustomers ?? "-",
      icon: Link2,
    },
    {
      title: "오늘 신규",
      value: stats?.todayNew ?? "-",
      icon: UserPlus,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
      {error && (
        <p className="mt-2 text-sm text-destructive">
          데이터를 불러올 수 없습니다: {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">카카오 ID</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  전화번호
                </th>
                <th className="px-4 py-3 font-medium">Cafe24 연결</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  등록일
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((customer) => (
                <tr
                  key={customer.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  onClick={() => router.push(`/customers/detail?id=${encodeURIComponent(customer.kakaoUserId)}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {customer.kakaoUserId.slice(0, 12)}...
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {customer.phoneNumber || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {customer.cafe24CustomerId ? (
                      <Badge variant="success">연결됨</Badge>
                    ) : (
                      <Badge variant="muted">미연결</Badge>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {formatDate(customer.createdAt)}
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    등록된 고객이 없습니다.
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
            <Link key={i} href={`/customers?page=${i + 1}`}>
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
