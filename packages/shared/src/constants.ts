/** 문의 채널 */
export const CHANNELS = ["kakao", "coupang", "naver", "cafe24", "manual"] as const;
export type Channel = (typeof CHANNELS)[number];

/** 지식 베이스 상태 */
export const KB_STATUSES = ["draft", "published", "archived"] as const;
export type KBStatus = (typeof KB_STATUSES)[number];

/** 문의 상태 */
export const INQUIRY_STATUSES = [
  "new",
  "answered",
  "refined",
  "published",
  "ignored",
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/** 답변 소스 */
export const RESPONSE_SOURCES = [
  "kb_match",
  "ai_generated",
  "fallback",
] as const;
export type ResponseSource = (typeof RESPONSE_SOURCES)[number];

/** 기본 카테고리 */
export const DEFAULT_CATEGORIES = [
  "배송",
  "교환/반품",
  "사용법",
  "AS/수리",
  "결제",
  "기타",
] as const;

/** 벡터 검색 설정 */
export const VECTOR_SEARCH = {
  /** 직접 KB 매칭 임계값 (이 이상이면 KB 답변 직접 반환) */
  SIMILARITY_THRESHOLD: 0.8,
  /** 검색 컨텍스트 임계값 (이 이상이면 AI 답변 컨텍스트로 활용) */
  CONTEXT_THRESHOLD: 0.3,
  /** 반환할 최대 결과 수 */
  MAX_RESULTS: 3,
  /** 임베딩 차원 수 */
  EMBEDDING_DIMENSIONS: 1536,
} as const;

/** 카카오 응답 제한 */
export const KAKAO_LIMITS = {
  /** 스킬 서버 응답 타임아웃 (ms) */
  SKILL_TIMEOUT_MS: 4500,
  /** SimpleText 최대 길이 */
  SIMPLE_TEXT_MAX_LENGTH: 1000,
  /** BasicCard description 최대 길이 */
  BASIC_CARD_MAX_LENGTH: 230,
} as const;
