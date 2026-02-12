"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  MessagesSquare,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/kb", label: "지식 베이스", icon: BookOpen },
  { href: "/inquiries", label: "문의 관리", icon: MessageSquare },
  { href: "/conversations", label: "대화 로그", icon: MessagesSquare },
  { href: "/settings", label: "설정", icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="sm:hidden">
      <div className="flex h-14 items-center justify-between border-b border-border bg-white px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-gray-900">
          <BookOpen className="h-5 w-5 text-primary" />
          KB Chatbot
        </Link>
        <button onClick={() => setOpen(!open)} className="p-2">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav className="border-b border-border bg-white px-4 py-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-gray-600 hover:bg-muted",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
