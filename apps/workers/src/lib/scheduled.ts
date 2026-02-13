/**
 * CF Workers Cron Trigger 핸들러
 *
 * 매시간 실행되어 쿠팡/네이버 문의를 incremental sync
 * API 키가 설정되지 않은 플랫폼은 건너뛴다.
 */

import { createDb } from "@kb-chatbot/database";
import { CoupangClient } from "./coupang-client.js";
import { NaverCommerceClient } from "./naver-client.js";
import { Cafe24Client } from "./cafe24-client.js";
import { DbTokenStore } from "./cafe24-token-store.js";
import { syncCoupang, syncNaver, syncCafe24 } from "./collector.js";
import type { Env } from "./env.js";

export async function runScheduledSync(env: Env): Promise<void> {
  const db = createDb(env.DATABASE_URL);

  // 쿠팡 동기화
  if (env.COUPANG_ACCESS_KEY && env.COUPANG_SECRET_KEY && env.COUPANG_VENDOR_ID) {
    try {
      const client = new CoupangClient({
        accessKey: env.COUPANG_ACCESS_KEY,
        secretKey: env.COUPANG_SECRET_KEY,
        vendorId: env.COUPANG_VENDOR_ID,
      });
      const result = await syncCoupang(db, client, env.OPENAI_API_KEY);
      console.log(
        `[Cron] Coupang sync: fetched=${result.recordsFetched}, created=${result.recordsCreated}`,
      );
    } catch (err) {
      console.error("[Cron] Coupang sync failed:", err);
    }
  }

  // 네이버 동기화
  if (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET) {
    try {
      const client = new NaverCommerceClient({
        clientId: env.NAVER_CLIENT_ID,
        clientSecret: env.NAVER_CLIENT_SECRET,
      });
      const result = await syncNaver(db, client, env.OPENAI_API_KEY);
      console.log(
        `[Cron] Naver sync: fetched=${result.recordsFetched}, created=${result.recordsCreated}`,
      );
    } catch (err) {
      console.error("[Cron] Naver sync failed:", err);
    }
  }

  // Cafe24 동기화
  if (env.CAFE24_MALL_ID && env.CAFE24_CLIENT_ID && env.CAFE24_CLIENT_SECRET) {
    try {
      const tokenStore = new DbTokenStore(db);
      const client = new Cafe24Client({
        mallId: env.CAFE24_MALL_ID,
        clientId: env.CAFE24_CLIENT_ID,
        clientSecret: env.CAFE24_CLIENT_SECRET,
        tokenStore,
      });
      const result = await syncCafe24(db, client, env.OPENAI_API_KEY);
      console.log(
        `[Cron] Cafe24 sync: fetched=${result.recordsFetched}, created=${result.recordsCreated}`,
      );
    } catch (err) {
      console.error("[Cron] Cafe24 sync failed:", err);
    }
  }
}
