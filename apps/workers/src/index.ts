import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppEnv, Env } from "./lib/env.js";
import { dbMiddleware } from "./middleware/db.js";
import { cfAccessAuth } from "./middleware/auth.js";
import { kakao } from "./routes/kakao.js";
import { kb } from "./routes/kb.js";
import { inquiry } from "./routes/inquiry.js";
import { conversationsRoute } from "./routes/conversations.js";
import { stats } from "./routes/stats.js";
import { collector } from "./routes/collector.js";
import { cafe24OAuth } from "./routes/cafe24-oauth.js";
import { customers } from "./routes/customers.js";
import { blockedTermsRoute } from "./routes/blocked-terms.js";
import { runScheduledSync } from "./lib/scheduled.js";

const app = new Hono<AppEnv>();

// 글로벌 미들웨어
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      // Custom domain
      if (origin.endsWith(".runvision.ai")) return origin;
      // CF Pages production + preview deployments
      if (origin === "https://kb-chatbot.pages.dev") return origin;
      if (origin.endsWith(".kb-chatbot.pages.dev")) return origin;
      // Allow localhost (any port) + private network IPs for local dev
      try {
        const url = new URL(origin);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
        if (/^(192\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) return origin;
      } catch {}
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Cf-Access-Jwt-Assertion",
      "cf-access-authenticated-user-email",
    ],
  }),
);

// DB 미들웨어 — 모든 라우트에 적용
app.use("*", dbMiddleware);

// 대시보드 API 인증 — CF Access (개발 시 스킵 가능)
app.use("/api/*", cfAccessAuth);

// 헬스체크 (인증 불필요)
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 라우트
app.route("/kakao", kakao);
app.route("/api/kb", kb);
app.route("/api/inquiries", inquiry);
app.route("/api/conversations", conversationsRoute);
app.route("/api/stats", stats);
app.route("/api/collector", collector);
app.route("/api/cafe24/oauth", cafe24OAuth);
app.route("/api/customers", customers);
app.route("/api/blocked-terms", blockedTermsRoute);

// 404
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// 에러 핸들러
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default {
  fetch: app.fetch,

  /**
   * CF Workers Cron Trigger 핸들러
   * 매시간 실행: 쿠팡/네이버 문의 incremental sync
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScheduledSync(env));
  },
};
