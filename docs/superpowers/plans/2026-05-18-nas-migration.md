# KB-Chatbot NAS 이전 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KB-Chatbot 앱+Postgres를 Synology NAS Docker로 이전하고 Neon/Workers를 폐기한다.

**Architecture:** 기존 `apps/workers/src/local-server.ts`(이미 Node/@hono/node-server 구동) + `createDb`의 자동 postgres.js 전환을 활용. NAS Docker Compose 3서비스(pgvector Postgres / Node 앱 / cloudflared). 앱 코드 변경 최소(스케줄러·R2 업로드·바인딩 보안 갭만).

**Tech Stack:** Synology DSM7 Docker, `pgvector/pgvector:pg17`, Node 22, pnpm 10, Hono, drizzle-orm/postgres-js, cloudflared, postgres.js

**전제(완료):** Neon 백업 `neon-20260518-1857.dump`(custom)+`.sql` — 로컬 `/Users/jhkim/kb-chatbot-backups/`, NAS `/volume1/Work/kb-chatbot/backups/`, MD5 검증됨. Neon PG 17.8, 12MB, 8테이블.

**SSH:** `SSHPASS='Go123Peac!!' sshpass -e ssh -o StrictHostKeyChecking=accept-new jhkim@192.192.192.145 '<cmd>'` — 파일 전송은 `ssh '... cat > dest' < src`(SFTP 비활성).

---

## File Structure

- Create: `apps/workers/Dockerfile` — Node 앱 컨테이너 빌드(pnpm 모노레포)
- Create: `deploy/nas/docker-compose.yml` — postgres/app/cloudflared 3서비스
- Create: `deploy/nas/.env.example` — NAS 런타임 환경변수 템플릿(시크릿 git 제외)
- (선택) `deploy/nas/cloudflared/config.yml` — 비토큰 모드에서만 필요. 토큰 모드(권장)는 Cloudflare 대시보드에서 Public Hostname 관리 → 파일 불필요
- Create: `apps/workers/src/lib/scheduler.ts` — node-cron 기반 시간당 마켓플레이스 동기화
- Modify: `apps/workers/src/local-server.ts` — 스케줄러 기동 추가
- Modify: `apps/workers/src/lib/local-bindings.ts` — R2 IMAGES S3 업로드 실구현(R2 유지), HOST/보안 env 반영
- Modify: `apps/workers/package.json` — `aws4fetch`, `node-cron` 의존성 추가
- Modify: `.gitignore` — `deploy/nas/.env`, `.env.local-api` 제외 확인

---

## Task 1: NAS Docker 권한·작업공간 확인

**Files:** 없음(운영 점검)

- [ ] **Step 1: NAS docker 권한 확인**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh -o StrictHostKeyChecking=accept-new jhkim@192.192.192.145 'sudo -n docker ps >/dev/null 2>&1 && echo SUDO_NOPASS_OK || (docker ps >/dev/null 2>&1 && echo DOCKER_DIRECT_OK || echo NEED_DOCKER_PERM)'
```
Expected: `SUDO_NOPASS_OK` 또는 `DOCKER_DIRECT_OK`. `NEED_DOCKER_PERM`이면 중단하고 사용자에게 DSM Container Manager 권한/`docker` 그룹 추가 요청.

- [ ] **Step 2: 작업 디렉터리 생성**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'mkdir -p /volume1/Work/kb-chatbot/{pgdata,app,cloudflared,backups} && ls -ld /volume1/Work/kb-chatbot/*'
```
Expected: 4개 디렉터리 + 기존 `backups`(덤프 존재).

- [ ] **Step 3: 시스템 PG 비충돌 확인**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'netstat -tlnp 2>/dev/null | grep -E ":5433|:3458" || echo PORTS_FREE'
```
Expected: `PORTS_FREE` (전용 PG는 compose 내부망 사용, 호스트 노출 시 5433).

---

## Task 2: NAS Postgres(pgvector) 컨테이너 기동

**Files:**
- Create: `deploy/nas/docker-compose.yml` (postgres 서비스만 우선)
- Create: `deploy/nas/.env.example`

- [ ] **Step 1: compose 파일 작성 (postgres 서비스)**

`deploy/nas/docker-compose.yml`:
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${PGUSER}
      POSTGRES_PASSWORD: ${PGPASSWORD}
      POSTGRES_DB: kbchatbot
    volumes:
      - /volume1/Work/kb-chatbot/pgdata:/var/lib/postgresql/data
    networks: [kbnet]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PGUSER} -d kbchatbot"]
      interval: 10s
      timeout: 5s
      retries: 10

networks:
  kbnet:
    driver: bridge
```

`deploy/nas/.env.example`:
```
PGUSER=kbchatbot
PGPASSWORD=CHANGE_ME_STRONG
DATABASE_URL=postgres://kbchatbot:CHANGE_ME_STRONG@postgres:5432/kbchatbot
OPENAI_API_KEY=sk-...
LOCAL_KAKAO_SKILL_KEY=<카카오 스킬 키>
CF_ACCESS_BYPASS=false
HOST=0.0.0.0
PORT=3458
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 s3 access key>
R2_SECRET_ACCESS_KEY=<r2 s3 secret>
R2_BUCKET=kb-chatbot
```

**경로 규약 (전 Task 공통):** compose 파일·`.env`는 NAS `/volume1/Work/kb-chatbot/docker-compose.yml`, 모든 `docker compose` 명령은 `cd /volume1/Work/kb-chatbot`. 리포는 Task 4에서 `/volume1/Work/kb-chatbot/repo/kb-chatbot`로 동기화(앱 빌드 컨텍스트). 백업 덤프는 기존 `/volume1/Work/kb-chatbot/backups/`(검증됨).

- [ ] **Step 2: NAS로 compose+env 전송, 실제 .env 작성**

Run (로컬에서):
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cat > /volume1/Work/kb-chatbot/docker-compose.yml' < deploy/nas/docker-compose.yml
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cat > /volume1/Work/kb-chatbot/.env.example' < deploy/nas/.env.example
```
그 후 NAS에서 `.env` 작성(사용자 시크릿 입력): `cd /volume1/Work/kb-chatbot && cp .env.example .env` 후 PGPASSWORD/OPENAI/LOCAL_KAKAO_SKILL_KEY/R2_* 채움, 권한 `chmod 600 .env`. `DATABASE_URL` 호스트는 `postgres`(compose 서비스명), `.neon.tech` 미포함 → createDb가 postgres.js 자동 선택.

- [ ] **Step 3: postgres 컨테이너 기동**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose --env-file .env up -d postgres'
```
Expected: `postgres` 컨테이너 생성·기동. (compose 파일에 아직 app/cloudflared 없어도 `up -d postgres`는 정상 — 서비스는 Task 4/8에서 추가 후 재전송.)

- [ ] **Step 4: 헬스/pgvector 확인**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose exec -T postgres psql -U kbchatbot -d kbchatbot -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname=\$\$vector\$\$;"'
```
Expected: vector 확장 버전 1행 출력.

---

## Task 3: 스키마+데이터 복원 (백업 → NAS PG)

**Files:** 없음(데이터 작업). 백업: NAS `/volume1/Work/kb-chatbot/backups/neon-20260518-1857.dump`

- [ ] **Step 1: 전체 덤프 복원 (8테이블 스키마+데이터)**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose cp backups/neon-20260518-1857.dump postgres:/tmp/neon.dump && /usr/local/bin/docker compose exec -T postgres pg_restore -U kbchatbot -d kbchatbot --no-owner --no-privileges /tmp/neon.dump'
```
Expected: 에러 없이 완료(권한/소유자 경고는 무시 가능 — `--no-owner`).

- [ ] **Step 2: 행수 검증 (소스=타깃)**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose exec -T postgres psql -U kbchatbot -d kbchatbot -c "SELECT count(*) FROM knowledge_items; SELECT count(*) FROM conversations; SELECT count(*) FROM raw_inquiries;"'
```
Expected: `knowledge_items` = 48 (Neon 원본과 동일). 불일치 시 중단·조사.

- [ ] **Step 3: variant 마이그레이션(0001,0002) 적용** (자기완결 — 볼륨/리포 비의존)

Run (로컬 → NAS로 SQL 2개 전송 후 컨테이너에 복사·적용):
```bash
for m in 0001_knowledge_question_variants 0002_variant_learning_logs; do
  SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 "cat > /volume1/Work/kb-chatbot/backups/$m.sql" < "packages/database/drizzle/$m.sql"
done
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && for m in 0001_knowledge_question_variants 0002_variant_learning_logs; do /usr/local/bin/docker compose cp backups/$m.sql postgres:/tmp/$m.sql && /usr/local/bin/docker compose exec -T postgres psql -U kbchatbot -d kbchatbot -v ON_ERROR_STOP=1 -f /tmp/$m.sql; done'
```
Expected: 두 SQL 에러 없이 적용(`CREATE TABLE` 등). 이미 존재 시 에러면 해당 테이블 선확인 후 스킵 판단.

- [ ] **Step 4: variant 테이블 생성 확인**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose exec -T postgres psql -U kbchatbot -d kbchatbot -c "SELECT to_regclass(\$\$public.knowledge_question_variants\$\$), to_regclass(\$\$public.variant_learning_logs\$\$);"'
```
Expected: 두 테이블 모두 non-null(존재).

---

## Task 4: 앱 컨테이너화 (기존 Node local-server)

**Files:**
- Create: `apps/workers/Dockerfile`
- Modify: `deploy/nas/docker-compose.yml` (app 서비스 추가)

- [ ] **Step 1: Dockerfile 작성**

`apps/workers/Dockerfile`:
```dockerfile
# 모노레포 루트에서 빌드 컨텍스트 사용
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/workers ./apps/workers
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/workers
EXPOSE 3458
CMD ["pnpm", "local"]
```

- [ ] **Step 2: compose에 app 서비스 추가**

`deploy/nas/docker-compose.yml`에 추가:
```yaml
  app:
    build:
      context: ./repo/kb-chatbot
      dockerfile: apps/workers/Dockerfile
    restart: unless-stopped
    env_file: [.env]
    environment:
      DATABASE_URL: ${DATABASE_URL}
      HOST: 0.0.0.0
      PORT: 3458
    depends_on:
      postgres:
        condition: service_healthy
    networks: [kbnet]
```
(`build.context`는 compose 파일 위치 `/volume1/Work/kb-chatbot/` 기준 → `./repo/kb-chatbot` = Task 4 Step 3에서 동기화된 리포 루트. 마이그레이션은 Task 3 Step 3에서 이미 자기완결 적용됨 — 볼륨 불필요.)

- [ ] **Step 3: 빌드+기동 (NAS는 모노레포 전체 필요 → 리포를 NAS로 동기화)**

Run (로컬 → NAS, 리포 동기화; node_modules/.git 제외). 선행: app 서비스가 포함된 최신 compose를 다시 전송 — `SSHPASS=... ssh ... 'cat > /volume1/Work/kb-chatbot/docker-compose.yml' < deploy/nas/docker-compose.yml` (cloudflared 서비스는 Task 8에서 추가 후 또 전송):
```bash
tar --exclude node_modules --exclude .git --exclude apps/dashboard/out -czf - -C /Users/jhkim/00.Projects kb-chatbot | SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'rm -rf /volume1/Work/kb-chatbot/repo && mkdir -p /volume1/Work/kb-chatbot/repo && tar -xzf - -C /volume1/Work/kb-chatbot/repo'
```
이제 `/volume1/Work/kb-chatbot/repo/kb-chatbot`가 리포 루트 = compose의 `build.context: ./repo/kb-chatbot`와 일치.

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose --env-file .env up -d --build app'
```
Expected: app 컨테이너 빌드 성공, 기동.

- [ ] **Step 4: 앱 헬스 체크 (컨테이너 내부)**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose exec -T app sh -c "wget -qO- http://127.0.0.1:3458/health"'
```
Expected: `{"status":"ok",...}`.

- [ ] **Step 5: 커밋**

```bash
git add apps/workers/Dockerfile deploy/nas/docker-compose.yml deploy/nas/.env.example
git commit -m "feat(deploy): NAS Docker compose + Dockerfile for self-hosted app+pg"
```

---

## Task 5: 마켓플레이스 동기화 스케줄러 (cron 대체)

**Files:**
- Modify: `apps/workers/package.json` (add `node-cron`)
- Create: `apps/workers/src/lib/scheduler.ts`
- Modify: `apps/workers/src/local-server.ts`

- [ ] **Step 1: node-cron 의존성 추가**

Run:
```bash
cd apps/workers && pnpm add node-cron && pnpm add -D @types/node-cron
```

- [ ] **Step 2: scheduler.ts 작성**

`apps/workers/src/lib/scheduler.ts`:
```ts
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
```

- [ ] **Step 3: local-server.ts에 스케줄러 기동 추가**

`apps/workers/src/local-server.ts` — `const env = createLocalEnv();` 다음 줄에 추가:
```ts
import { startScheduler } from "./lib/scheduler.js";
// ... 기존 코드 ...
const env = createLocalEnv();
startScheduler(env);
```

- [ ] **Step 4: 타입체크**

Run: `cd apps/workers && npx tsc --noEmit 2>&1 | grep -E "scheduler|local-server" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 5: 커밋**

```bash
git add apps/workers/package.json apps/workers/src/lib/scheduler.ts apps/workers/src/local-server.ts ../../pnpm-lock.yaml
git commit -m "feat(local): hourly marketplace sync scheduler (replaces CF cron, drops keepalive)"
```

---

## Task 6: 로컬모드 R2 이미지 업로드 실구현 (R2 유지)

**Files:**
- Modify: `apps/workers/package.json` (add `aws4fetch`)
- Modify: `apps/workers/src/lib/local-bindings.ts`

- [ ] **Step 1: aws4fetch 추가**

Run: `cd apps/workers && pnpm add aws4fetch`

- [ ] **Step 2: local-bindings.ts IMAGES 실구현**

`apps/workers/src/lib/local-bindings.ts` — 상단 import 추가 및 `createLocalEnv()` 내 `IMAGES` 교체:
```ts
import { AwsClient } from "aws4fetch";
// ...
function makeR2Bucket(): R2Bucket {
  const acct = process.env.R2_ACCOUNT_ID ?? "";
  const bucket = process.env.R2_BUCKET ?? "kb-chatbot";
  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    service: "s3",
    region: "auto",
  });
  const base = `https://${acct}.r2.cloudflarestorage.com/${bucket}`;
  return {
    put: async (key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) => {
      const res = await client.fetch(`${base}/${key}`, {
        method: "PUT",
        body: value,
        headers: opts?.httpMetadata?.contentType
          ? { "content-type": opts.httpMetadata.contentType }
          : undefined,
      });
      if (!res.ok) throw new Error(`R2 put failed: ${res.status} ${await res.text()}`);
      return undefined as unknown as R2Object;
    },
  } as unknown as R2Bucket;
}
```
그리고 `createLocalEnv()`의 `IMAGES:` 값을 `makeR2Bucket()`로 교체.

- [ ] **Step 3: 타입체크**

Run: `cd apps/workers && npx tsc --noEmit 2>&1 | grep local-bindings || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 4: 커밋**

```bash
git add apps/workers/package.json apps/workers/src/lib/local-bindings.ts ../../pnpm-lock.yaml
git commit -m "feat(local): real R2 image upload via S3 API in local/NAS mode"
```

---

## Task 7: 보안 — 인증 경로 잠금

**Files:** 없음(설정 검증) — `deploy/nas/.env`

- [ ] **Step 1: 카카오 스킬 인증 확인**

`.env`에 `LOCAL_KAKAO_SKILL_KEY`=실제 카카오 스킬 키 설정 확인. 미설정 시 `kakaoSkillAuth`가 인증 스킵 → `/kakao/skill` 무방비. 설정 후 컨테이너 재기동.

- [ ] **Step 2: 대시보드 API 보호 결정**

`CF_ACCESS_BYPASS=true`면 `/api/*`(KB 관리)가 무인증 노출. 터널 호스트에 Cloudflare Access 정책(`/api/*` 경로) 적용 OR `CF_ACCESS_BYPASS=false` + cfAccessAuth 동작 확인. 결정·적용 후 검증:

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose exec -T app sh -c "wget -qO- --server-response http://127.0.0.1:3458/api/kb 2>&1 | head -1"'
```
Expected: 인증 미설정 시 401/403 (보호됨). 200이면 보안 조치 필요.

---

## Task 8: cloudflared 터널

**Files:**
- Create: `deploy/nas/cloudflared/config.yml`
- Modify: `deploy/nas/docker-compose.yml` (cloudflared 서비스)

- [ ] **Step 1: 터널 생성 (사용자 액션 — 1회 인증)**

사용자가 Cloudflare에서 Named Tunnel 생성 후 토큰 발급. (또는 `cloudflared tunnel login` 브라우저 인증.) 토큰을 `.env`의 `TUNNEL_TOKEN`에 저장.

- [ ] **Step 2: compose cloudflared 서비스 추가**

`deploy/nas/docker-compose.yml`:
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
    depends_on: [app]
    networks: [kbnet]
```
Cloudflare 대시보드에서 Public Hostname `kb-api.runvision.ai` → `http://app:3458` 라우팅 설정(터널 측). config.yml은 토큰 모드 시 불필요(대시보드 관리).

- [ ] **Step 3: cloudflared 기동**

Run:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose --env-file .env up -d cloudflared && /usr/local/bin/docker compose logs --tail=20 cloudflared'
```
Expected: 로그에 `Registered tunnel connection` 표시.

---

## Task 9: 컷오버 + 검증

**Files:** 없음(운영)

- [ ] **Step 1: DNS 재지정 (사용자 액션)**

Cloudflare에서 `kb-api.runvision.ai`를 기존 Workers 커스텀도메인에서 분리하고, cloudflared 터널 Public Hostname으로 지정. (이전 Worker는 폐기 전까지 보존 — 롤백용.)

- [ ] **Step 2: 실엔드포인트 헬스/DB 확인**

Run (로컬에서):
```bash
curl -s https://kb-api.runvision.ai/health && echo && curl -s https://kb-api.runvision.ai/db-ping
```
Expected: health ok, db-ping `{"ok":true,"ms":<작은값>}` (NAS 로컬 PG라 서브-ms~수ms).

- [ ] **Step 3: 카카오 실메시지 검증**

카카오톡 채널에서 전송:
- "제품 무게는 얼마나 되나요?" → KB 답변("10.1g") 즉시
- "무게는?" → variant 매칭으로 빠른 응답(미스 시에도 무응답 아님)

NAS 앱 로그 확인:
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose logs --tail=40 app | grep -E "DIAG|POST /kakao"'
```
Expected: `branch=answered source=kb_match` 빠른 ms, 무응답 없음.

- [ ] **Step 4: variant 백필 (recall 개선)**

Run (NAS app 컨테이너에서 운영자 엔드포인트 호출 또는 스크립트):
```bash
SSHPASS='Go123Peac!!' sshpass -e ssh jhkim@192.192.192.145 'cd /volume1/Work/kb-chatbot && /usr/local/bin/docker compose exec -T postgres psql -U kbchatbot -d kbchatbot -c "SELECT count(*) FROM knowledge_question_variants;"'
```
변형 0개면 published 항목별 `generateAndReplaceQuestionVariants`를 일괄 호출(kb.ts:71 엔드포인트 또는 일회성 스크립트). 검증: 변형수 > 0, "무게는?" 유사도 ≥ 0.8.

---

## Task 10: 폐기 + 정리

**Files:**
- Modify: `apps/workers/wrangler.toml` (또는 Worker 삭제 결정)

- [ ] **Step 1: 안정 관찰 (24h)**

NAS 무응답/에러 0건 확인 후 진행. 불안정 시 Step 1(DNS) 롤백.

- [ ] **Step 2: keepalive cron 흔적 제거**

Workers 폐기 시 자동 소멸. Worker 유지 시 `wrangler.toml` `crons`에서 `* * * * *` 제거 후 재배포(불필요한 Neon 접속 방지). Neon 프로젝트는 데이터 확인 후 사용자가 삭제/다운그레이드.

- [ ] **Step 3: 인프라 메모리 갱신**

`memory/infrastructure.md`를 NAS 구성으로 갱신(DB=NAS pgvector, 배포=NAS docker compose, keepalive 폐기). 사용자 확인 후 반영.

- [ ] **Step 4: 최종 커밋**

```bash
git add -A && git commit -m "chore: decommission Neon/Workers keepalive after NAS cutover"
```

---

## 미해결 / 사용자 액션 의존

- NAS `docker` sudo 권한 (Task 1) — 막히면 사용자 DSM 설정 필요
- R2 S3 자격증명 (Task 2/6) — 없으면 운영자 이미지 업로드만 일시 제한(챗봇 무관)
- cloudflared 터널 토큰 발급 + `kb-api.runvision.ai` DNS 재지정 (Task 8/9) — 사용자만 가능
- `/api/*` 대시보드 인증 정책 결정 (Task 7) — 보안상 컷오버 전 필수
