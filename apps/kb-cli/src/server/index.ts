import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import type { Database } from "@kb-chatbot/database";
import { createIngestRoutes } from "./routes/ingest.js";
import type { R2Config } from "../storage/r2.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLAUDE_PROXY_URL = "http://127.0.0.1:3456/v1/models";

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createApp(db: Database, openaiApiKey: string, port: number, r2Config?: R2Config) {
  const app = new Hono();

  // ── CORS ────────────────────────────────────────────────────────────────
  app.use(
    "*",
    cors({
      origin: [
        "http://localhost:3000",
        "http://localhost:3001",
      ],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  // ── Health Check ────────────────────────────────────────────────────────
  app.get("/health", async (c) => {
    // Check Claude proxy
    let claudeProxy = "unavailable";
    try {
      const res = await fetch(CLAUDE_PROXY_URL, {
        signal: AbortSignal.timeout(3000),
      });
      claudeProxy = res.ok ? "connected" : `error (${res.status})`;
    } catch {
      claudeProxy = "unavailable";
    }

    // Check DB connection with a lightweight query
    let database = "unavailable";
    try {
      await db.execute(sql`SELECT 1`);
      database = "connected";
    } catch {
      database = "unavailable";
    }

    const status = database === "connected" ? "ok" : "degraded";
    return c.json({
      status,
      claudeProxy,
      database,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Ingest routes ──────────────────────────────────────────────────────
  app.route("/ingest", createIngestRoutes(db, openaiApiKey, port, r2Config));

  return app;
}
