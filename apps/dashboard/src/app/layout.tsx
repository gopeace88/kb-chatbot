import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KB Chatbot 대시보드",
  description: "지식 베이스 관리 및 고객 문의 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 antialiased">{children}</body>
    </html>
  );
}
