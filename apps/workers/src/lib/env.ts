import type { Database } from "@kb-chatbot/database";

/** Cloudflare Workers 환경 변수 바인딩 */
export interface Env {
  // Secrets
  DATABASE_URL: string;
  OPENAI_API_KEY: string;
  KAKAO_SKILL_KEY: string;

  // 개발 모드
  CF_ACCESS_BYPASS?: string;

  // 마켓플레이스 API (Phase 6)
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  COUPANG_VENDOR_ID: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
}

/** Hono 컨텍스트에 주입되는 변수 */
export interface AppVariables {
  db: Database;
  userEmail?: string;
}

/** Hono 앱 전체에서 사용하는 환경 타입 */
export interface AppEnv {
  Bindings: Env;
  Variables: AppVariables;
}
