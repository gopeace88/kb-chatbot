# Local API + NAS PostgreSQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the latency-sensitive Kakao/API runtime off Cloudflare Workers onto the always-on Mac mini, backed by a pgvector PostgreSQL container on the Synology NAS.

**Architecture:** Keep Cloudflare Pages for the dashboard and Cloudflare Tunnel for public ingress. Run the API server on the Mac mini, connect it to a NAS-hosted `pgvector/pgvector` PostgreSQL container through a persistent SSH tunnel, and keep the current Cloudflare Worker + Neon DB as rollback until production behavior is verified.

**Tech Stack:** Hono, Node server adapter, PostgreSQL with pgvector, Synology Container Manager Docker, Cloudflare Tunnel, macOS launchd.

---

## Constraints And Current Facts

- Current Kakao skill/API runs on Cloudflare Workers app `kb-chatbot-api`.
- Current DB is Neon PostgreSQL using `@neondatabase/serverless` and `drizzle-orm/neon-http`.
- NAS built-in PostgreSQL 11.11 is running on `127.0.0.1:5432`, but `vector` extension is not available.
- NAS has Synology Container Manager Docker at `/usr/local/bin/docker`.
- Mac mini has `cloudflared` and `sshpass`, but no local `psql` or Docker.
- Existing dashboard upload uses Cloudflare R2 binding `IMAGES`; local API must either preserve this route through an R2-compatible client or leave upload on the Worker during phase 1.
- Existing Worker uses Cloudflare KV bindings `RATE_LIMIT` and `BLOCKED_TERMS_CACHE`; local API needs an in-memory fallback for Kakao traffic.

## Rollout Strategy

1. Build a new local runtime without deleting or disabling the current Worker.
2. Create a NAS `pgvector` PostgreSQL container on a non-conflicting local port.
3. Copy Neon data to the NAS DB.
4. Start the Mac mini API on a private local port and verify `/health`, `/db-ping`, and `/kakao/skill`.
5. Point a Cloudflare Tunnel hostname at the Mac mini API.
6. Update Kakao skill URL only after the tunnel endpoint passes live checks.
7. Keep Worker + Neon untouched for rollback.

## Files To Modify

- `packages/database/package.json`: add standard PostgreSQL driver dependency.
- `packages/database/src/client.ts`: support standard PostgreSQL URLs in addition to Neon HTTP URLs.
- `apps/workers/package.json`: add local server dependencies and scripts.
- `apps/workers/src/index.ts`: export reusable Hono app or app factory without breaking Worker export.
- `apps/workers/src/local-server.ts`: new Node/Mac mini server entrypoint.
- `apps/workers/src/lib/local-bindings.ts`: new local replacements for Worker env, KV, execution context, and optional R2 handling.
- `ops/local/`: new operational scripts and launchd plist templates.

## Task 1: NAS pgvector PostgreSQL

- [ ] Create `/volume1/docker/kb-chatbot-postgres` on NAS.
- [ ] Run `pgvector/pgvector:pg16` container with persistent data.
- [ ] Bind container PostgreSQL to NAS loopback or LAN-only port.
- [ ] Create database `kb_chatbot` and user `kb_chatbot`.
- [ ] Verify `CREATE EXTENSION vector;` works.

Expected verification:

```bash
select extname from pg_extension where extname = 'vector';
```

## Task 2: Data Migration

- [ ] Export current Neon data with a compatible dump/copy method.
- [ ] Import into NAS pgvector database.
- [ ] Verify row counts for core tables: `knowledge_items`, `raw_inquiries`, `conversations`, `blocked_terms`.
- [ ] Verify vector search query runs against `knowledge_items.question_embedding`.

## Task 3: Local API Runtime

- [ ] Add a local server entrypoint that calls the same Hono app.
- [ ] Provide `process.env` based bindings for `DATABASE_URL`, `OPENAI_API_KEY`, Kakao keys, and marketplace keys.
- [ ] Provide local in-memory replacements for KV methods used by Kakao rate-limit and blocked-term caching.
- [ ] Keep Cloudflare Worker export working unchanged.

Expected verification:

```bash
curl -s http://127.0.0.1:3458/health
curl -s http://127.0.0.1:3458/db-ping
```

## Task 4: Persistent Mac mini Services

- [ ] Create launchd job for SSH tunnel: `127.0.0.1:15432 -> NAS pgvector container`.
- [ ] Create launchd job for local API server on `127.0.0.1:3458`.
- [ ] Create Cloudflare Tunnel config for `kb-api-local.runvision.ai -> http://127.0.0.1:3458`.
- [ ] Verify services restart after `launchctl kickstart`.

## Task 5: Live Cutover

- [ ] Test Kakao skill payload against `kb-api-local.runvision.ai/kakao/skill`.
- [ ] Update Kakao OpenBuilder skill URL to the local tunnel hostname.
- [ ] Send real Kakao messages and confirm bot answers before 1:1 handoff.
- [ ] Leave `kb-api.runvision.ai` Worker endpoint untouched for rollback.

## Rollback

- Restore Kakao OpenBuilder skill URL to `https://kb-chatbot-api.gopeace88.workers.dev/kakao/skill`.
- Stop local API launchd job.
- Stop local SSH tunnel launchd job.
- Keep NAS database untouched until the rollback window ends.

## Self-Review

- No destructive action is required before verification.
- The plan does not modify the existing Worker deployment path until the final cutover.
- The NAS built-in PostgreSQL is not reused because pgvector is not available there.
- R2 upload support is called out as a separate local binding concern so dashboard behavior is not accidentally broken.
