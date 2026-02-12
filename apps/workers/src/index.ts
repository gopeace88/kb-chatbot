import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./lib/env.js";
import { kakao } from "./routes/kakao.js";
import { kb } from "./routes/kb.js";
import { inquiry } from "./routes/inquiry.js";
import { collector } from "./routes/collector.js";

const app = new Hono<{ Bindings: Env }>();

// 글로벌 미들웨어
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:3000"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "Cf-Access-Jwt-Assertion"],
  }),
);

// 헬스체크
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 라우트
app.route("/kakao", kakao);
app.route("/api/kb", kb);
app.route("/api/inquiries", inquiry);
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
