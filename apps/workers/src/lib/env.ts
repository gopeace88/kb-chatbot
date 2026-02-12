/** Cloudflare Workers 환경 변수 바인딩 */
export interface Env {
  // Secrets
  DATABASE_URL: string;
  OPENAI_API_KEY: string;
  KAKAO_SKILL_KEY: string;

  // 마켓플레이스 API (Phase 6)
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  COUPANG_VENDOR_ID: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
}
