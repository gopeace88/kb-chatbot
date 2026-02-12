import { createMiddleware } from "hono/factory";
import { createDb, type Database } from "@kb-chatbot/database";
import type { Env } from "../lib/env.js";

/**
 * DB 초기화 미들웨어
 * Neon serverless 클라이언트를 요청마다 생성 후 컨텍스트에 주입
 */
export const dbMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { db: Database };
}>(async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set("db", db);
  await next();
});
