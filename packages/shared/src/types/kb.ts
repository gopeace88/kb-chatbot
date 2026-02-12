import type {
  Channel,
  InquiryStatus,
  KBStatus,
  ResponseSource,
} from "../constants.js";

/** 지식 베이스 아이템 */
export interface KnowledgeItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  tags: string[] | null;
  sourceInquiryId: string | null;
  status: KBStatus;
  usageCount: number;
  helpfulCount: number;
  createdBy: string | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 원본 문의 */
export interface RawInquiry {
  id: string;
  channel: Channel;
  externalId: string | null;
  customerName: string | null;
  questionText: string;
  answerText: string | null;
  aiCategory: string | null;
  aiSummary: string | null;
  status: InquiryStatus;
  knowledgeItemId: string | null;
  receivedAt: Date;
  answeredAt: Date | null;
  answeredBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 대화 로그 */
export interface Conversation {
  id: string;
  kakaoUserId: string;
  userMessage: string;
  botResponse: string;
  responseSource: ResponseSource;
  matchedKbId: string | null;
  similarityScore: number | null;
  wasHelpful: boolean | null;
  createdAt: Date;
}

/** 수집 동기화 로그 */
export interface CollectorSyncLog {
  id: string;
  platform: string;
  syncType: "full" | "incremental";
  status: "running" | "completed" | "failed";
  recordsFetched: number;
  recordsCreated: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

/** KB 생성 요청 */
export interface CreateKBRequest {
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
}

/** KB 수정 요청 */
export interface UpdateKBRequest {
  question?: string;
  answer?: string;
  category?: string;
  tags?: string[];
}

/** 페이지네이션 파라미터 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** 페이지네이션 응답 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
