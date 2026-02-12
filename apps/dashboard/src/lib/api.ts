const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

export async function apiClient<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      // 개발 모드에서는 CF Access 바이패스
      "Cf-Access-Jwt-Assertion": "dev",
      "cf-access-authenticated-user-email": "dev@localhost",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: string }).error || `API error: ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

// ── 타입 ──

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface KBItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  tags: string[] | null;
  status: "draft" | "published" | "archived";
  usageCount: number;
  helpfulCount: number;
  createdBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Inquiry {
  id: string;
  channel: "kakao" | "coupang" | "naver" | "manual";
  externalId: string | null;
  customerName: string | null;
  questionText: string;
  answerText: string | null;
  aiCategory: string | null;
  aiSummary: string | null;
  status: "new" | "answered" | "refined" | "published" | "ignored";
  knowledgeItemId: string | null;
  receivedAt: string;
  answeredAt: string | null;
  answeredBy: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  kakaoUserId: string;
  userMessage: string;
  botResponse: string;
  responseSource: "kb_match" | "ai_generated" | "fallback";
  matchedKbId: string | null;
  similarityScore: number | null;
  wasHelpful: boolean | null;
  createdAt: string;
}

export interface DashboardStats {
  totalKB: number;
  publishedKB: number;
  todayInquiries: number;
  newInquiries: number;
  todayConversations: number;
  autoAnswerRate: number;
}

export interface ConversationStats {
  bySource: Array<{ source: string; count: number }>;
  byDate: Array<{ date: string; count: number }>;
}

// ── API 함수 ──

export const api = {
  // Stats
  getDashboardStats: () => apiClient<DashboardStats>("/api/stats/dashboard"),

  // KB
  listKB: (params?: { page?: number; status?: string; category?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    if (params?.search) qs.set("search", params.search);
    return apiClient<PaginatedResponse<KBItem>>(`/api/kb?${qs}`);
  },
  getKB: (id: string) => apiClient<KBItem>(`/api/kb/${id}`),
  createKB: (data: { question: string; answer: string; category?: string; tags?: string[] }) =>
    apiClient<KBItem>("/api/kb", { method: "POST", body: JSON.stringify(data) }),
  updateKB: (id: string, data: { question?: string; answer?: string; category?: string; tags?: string[] }) =>
    apiClient<KBItem>(`/api/kb/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteKB: (id: string) =>
    apiClient<{ success: boolean }>(`/api/kb/${id}`, { method: "DELETE" }),
  publishKB: (id: string) =>
    apiClient<KBItem>(`/api/kb/${id}/publish`, { method: "POST" }),
  archiveKB: (id: string) =>
    apiClient<KBItem>(`/api/kb/${id}/archive`, { method: "POST" }),

  // Inquiries
  listInquiries: (params?: { page?: number; channel?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.channel) qs.set("channel", params.channel);
    if (params?.status) qs.set("status", params.status);
    return apiClient<PaginatedResponse<Inquiry>>(`/api/inquiries?${qs}`);
  },
  getInquiry: (id: string) => apiClient<Inquiry>(`/api/inquiries/${id}`),
  answerInquiry: (id: string, answerText: string) =>
    apiClient<Inquiry>(`/api/inquiries/${id}/answer`, {
      method: "PUT",
      body: JSON.stringify({ answerText }),
    }),
  refineInquiry: (id: string) =>
    apiClient<KBItem>(`/api/inquiries/${id}/refine`, { method: "POST" }),
  publishInquiry: (id: string) =>
    apiClient<KBItem>(`/api/inquiries/${id}/publish`, { method: "POST" }),

  // Conversations
  listConversations: (params?: { page?: number; kakaoUserId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.kakaoUserId) qs.set("kakaoUserId", params.kakaoUserId);
    return apiClient<PaginatedResponse<Conversation>>(`/api/conversations?${qs}`);
  },
  getConversationStats: (days?: number) =>
    apiClient<ConversationStats>(`/api/conversations/stats?days=${days || 7}`),
};
