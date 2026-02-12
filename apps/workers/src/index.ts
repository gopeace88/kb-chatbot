import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppEnv } from "./lib/env.js";
import { dbMiddleware } from "./middleware/db.js";
import { cfAccessAuth } from "./middleware/auth.js";
import { kakao } from "./routes/kakao.js";
import { kb } from "./routes/kb.js";
import { inquiry } from "./routes/inquiry.js";
import { conversationsRoute } from "./routes/conversations.js";
import { stats } from "./routes/stats.js";
import { collector } from "./routes/collector.js";

const app = new Hono<AppEnv>();

// 글로벌 미들웨어
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000"],
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

// 404
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// 에러 핸들러
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
