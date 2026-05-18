import cron from "node-cron";
import { runScheduledSync } from "./scheduled.js";
import type { Env } from "./env.js";

/** 시간당 마켓플레이스 incremental sync. keepalive는 로컬 PG라 불필요. */
export function startScheduler(env: Env): void {
  cron.schedule("0 * * * *", () => {
    runScheduledSync(env).catch((err) =>
      console.error("[scheduler] sync failed:", err),
    );
  });
  console.log("[scheduler] hourly marketplace sync registered");
}
