const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "https://kb-api.runvision.ai"
    : "http://localhost:8787");

const isDev =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    /^(192\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname));

export async function apiClient<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) ?? {}),
  };

  // 개발 모드에서만 CF Access 바이패스 헤더 전송
  if (isDev) {
    headers["Cf-Access-Jwt-Assertion"] = "dev";
    headers["cf-access-authenticated-user-email"] = "dev@localhost";
  }

  const response = await fetch(url, {
    ...options,
    headers,
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
  imageUrl: string | null;
}

export interface Inquiry {
  id: string;
  channel: "kakao" | "coupang" | "naver" | "cafe24" | "manual";
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
  agentResponse: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalKB: number;
  publishedKB: number;
  todayInquiries: number;
  newInquiries: number;
  todayConversations: number;
  autoAnswerRate: number;
  unresolvedCount: number;
}

export interface ConversationStats {
  bySource: Array<{ source: string; count: number }>;
  byDate: Array<{ date: string; count: number }>;
}

export interface SyncResult {
  syncLogId: string;
  recordsFetched: number;
  recordsCreated: number;
  errors: string[];
}

export interface CustomerLink {
  id: string;
  kakaoUserId: string;
  phoneNumber: string | null;
  cafe24CustomerId: string | null;
  cafe24MemberId: string | null;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerStats {
  totalCustomers: number;
  linkedCustomers: number;
  todayNew: number;
}

export interface RAGStats {
  sourceDist: Array<{ source: string; count: number; pct: number }>;
  dailyConversations: Array<{ date: string; count: number }>;
  avgSimilarity: number;
  feedbackStats: { helpful: number; notHelpful: number; noFeedback: number };
  categoryUsage: Array<{ category: string; count: number }>;
}

export interface TopQuestion {
  id: string;
  question: string;
  category: string | null;
  matchCount: number;
}

export interface SyncLog {
  id: string;
  platform: string;
  syncType: "full" | "incremental";
  status: "running" | "completed" | "failed";
  recordsFetched: number;
  recordsCreated: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface BlockedTerm {
  id: string;
  pattern: string;
  matchType: "contains" | "exact" | "regex";
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface UnansweredQuestion {
  userMessage: string;
  count: number;
  lastAsked: string;
}

// ── Monitoring 타입 ──

export interface NeonMonitoringData {
  project: {
    project: {
      id: string;
      name: string;
      region_id: string;
      pg_version: number;
      compute_time_seconds: number;
      active_time_seconds: number;
      data_transfer_bytes: number;
      written_data_bytes: number;
      synthetic_storage_size: number;
      compute_last_active_at: string;
      consumption_period_start: string;
      consumption_period_end: string;
      owner: {
        subscription_type: string;
      };
    };
  };
  consumption: null | {
    projects: Array<{
      project_id: string;
      periods: Array<{
        period_plan: string;
        consumption: Array<{
          timeframe_start: string;
          timeframe_end: string;
          metrics: Array<{
            metric_name: string;
            value: number;
          }>;
        }>;
      }>;
    }>;
  };
}

export interface CFWorkersData {
  data: {
    viewer: {
      accounts: Array<{
        workersInvocationsAdaptive: Array<{
          sum: { requests: number; errors: number; subrequests: number };
          quantiles: { cpuTimeP50: number; cpuTimeP99: number };
          dimensions: { date: string; scriptName: string; status: string };
        }>;
      }>;
    };
  };
}

export interface CFPagesData {
  result: Array<{
    id: string;
    short_id: string;
    project_name: string;
    environment: string;
    url: string;
    latest_stage: {
      name: string;
      status: string;
      started_on: string;
      ended_on: string;
    };
    deployment_trigger: {
      type: string;
      metadata: {
        branch: string;
        commit_hash: string;
        commit_message: string;
      };
    };
    created_on: string;
  }>;
}

export interface CFAIGatewayData {
  data: {
    viewer: {
      accounts: Array<{
        aiGatewayRequestsAdaptiveGroups: Array<{
          count: number;
          sum: {
            cachedRequests: number;
            erroredRequests: number;
            cost: number;
            cachedTokensIn: number;
            cachedTokensOut: number;
            uncachedTokensIn: number;
            uncachedTokensOut: number;
          };
          dimensions: {
            datetimeHour: string;
            model: string;
            provider: string;
          };
        }>;
      }>;
    };
  };
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
  createKB: (data: { question: string; answer: string; category?: string; tags?: string[]; imageUrl?: string }) =>
    apiClient<KBItem>("/api/kb", { method: "POST", body: JSON.stringify(data) }),
  updateKB: (id: string, data: { question?: string; answer?: string; category?: string; tags?: string[]; imageUrl?: string | null }) =>
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

  // Unresolved Conversations
  listUnresolved: (params?: { page?: number; days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.days) qs.set("days", String(params.days));
    return apiClient<PaginatedResponse<Conversation>>(`/api/conversations/unresolved?${qs}`);
  },
  resolveConversation: (id: string, agentResponse: string) =>
    apiClient<{ data: Conversation }>(`/api/conversations/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ agentResponse }),
    }),

  // Collector
  syncCoupang: (syncType?: "full" | "incremental") =>
    apiClient<SyncResult>("/api/collector/coupang/sync", {
      method: "POST",
      body: JSON.stringify({ syncType: syncType || "incremental" }),
    }),
  syncNaver: (syncType?: "full" | "incremental") =>
    apiClient<SyncResult>("/api/collector/naver/sync", {
      method: "POST",
      body: JSON.stringify({ syncType: syncType || "incremental" }),
    }),
  syncCafe24: (syncType?: "full" | "incremental") =>
    apiClient<SyncResult>("/api/collector/cafe24/sync", {
      method: "POST",
      body: JSON.stringify({ syncType: syncType || "incremental" }),
    }),
  getCollectorLogs: (limit?: number) =>
    apiClient<{ data: SyncLog[] }>(`/api/collector/logs?limit=${limit || 50}`),

  // Customers
  listCustomers: (params?: { page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    return apiClient<PaginatedResponse<CustomerLink>>(`/api/customers?${qs}`);
  },
  getCustomerStats: () => apiClient<CustomerStats>("/api/customers/stats"),
  getCustomer: (kakaoUserId: string) =>
    apiClient<CustomerLink>(`/api/customers/${encodeURIComponent(kakaoUserId)}`),

  // RAG Stats
  getRAGStats: (days = 7) =>
    apiClient<RAGStats>(`/api/stats/rag?days=${days}`),

  // Top Questions
  getTopQuestions: (days = 30, limit = 10) =>
    apiClient<{ data: TopQuestion[] }>(`/api/stats/top-questions?days=${days}&limit=${limit}`),

  // Unanswered Questions
  getUnansweredQuestions: (days = 30) =>
    apiClient<{ data: UnansweredQuestion[] }>(`/api/stats/unanswered?days=${days}`),

  // Blocked Terms
  listBlockedTerms: () =>
    apiClient<{ data: BlockedTerm[] }>("/api/blocked-terms"),
  createBlockedTerm: (data: { pattern: string; matchType?: string; reason?: string }) =>
    apiClient<BlockedTerm>("/api/blocked-terms", { method: "POST", body: JSON.stringify(data) }),
  deleteBlockedTerm: (id: string) =>
    apiClient<{ success: boolean }>(`/api/blocked-terms/${id}`, { method: "DELETE" }),

  // Monitoring
  getMonitoringNeon: (days = 7) =>
    apiClient<NeonMonitoringData>(`/api/monitoring/neon?days=${days}`),
  getMonitoringCFWorkers: (days = 7) =>
    apiClient<CFWorkersData>(`/api/monitoring/cf-workers?days=${days}`),
  getMonitoringCFPages: (limit = 20) =>
    apiClient<CFPagesData>(`/api/monitoring/cf-pages?limit=${limit}`),
  getMonitoringCFAIGateway: (days = 7) =>
    apiClient<CFAIGatewayData>(`/api/monitoring/cf-ai-gateway?days=${days}`),
};
