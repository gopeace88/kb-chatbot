# KB-Chatbot: Neon → NAS 자가호스팅 이전 설계

- **작성일**: 2026-05-18
- **상태**: 설계 승인됨 (Approach C), 구현 계획 대기
- **승인자**: 사용자 (2026-05-18)

## 1. 배경 / 문제

- Neon 무료 플랜의 월 컴퓨트 할당량(100 CU-hour) **완전 소진** (2026-05-17 14:52 알림). 다음 달 리셋 전까지 INSERT·UPDATE·쿼리가 간헐 에러.
- 근본 원인 중 하나: 콜드스타트 방지용 keepalive cron(`* * * * *`)이 Neon 컴퓨트를 24/7 깨워 둠 → 무료 할당량을 빠르게 소진하는 악순환.
- 증상: KB 검색 지연이 705ms ↔ 2810ms로 출렁여 카카오 스킬 ~3초 벽을 넘김 → 사용자 무응답.
- 부수 발견: 유사질문(variant) 시스템 코드는 존재하나 마이그레이션 미적용으로 프로덕션에 `knowledge_question_variants` 테이블 부재 → 검색 recall 저하("무게는?" 류 미스).

## 2. 목표 / 성공 기준

1. Neon 의존 제거. DB를 NAS 자가호스팅 Postgres+pgvector로 이전.
2. 앱·DB colocate로 DB 지연을 일정한 서브-ms 수준으로 (출렁임 제거).
3. keepalive cron 폐기 (로컬 PG는 상시 가동).
4. 마이그레이션 0000~0002 전부 적용 → variant 테이블 생성(검색 recall 개선 부수 효과).
5. 카카오 봇 엔드포인트(`kb-api.runvision.ai`)가 NAS에서 정상 응답.
6. 데이터 무손실 (백업 완료·검증됨).

## 3. 결정: Approach C — 앱 전체 NAS 이전

Hono 앱 + Postgres를 NAS Docker에서 구동. 외부 노출은 카카오용 HTTPS 엔드포인트 하나만 Cloudflare Tunnel(HTTP)로. (대안 A: Workers 유지 + Hyperdrive+Tunnel — 복잡하고 콜드스타트·출렁임 잔존. 대안 B: neon-http 호환 프록시 — 취약. 모두 기각.)

근거: 사용자 실고통(지연 출렁임·Neon 할당량·콜드스타트) 일괄 해소, 노출 표면 최소(HTTP 1개), 표준 Postgres 드라이버, `@hono/node-server` 이미 의존성에 존재해 포팅 부담 작음.

## 4. 대상 환경 (점검 완료)

- Synology DSM 7.3.2, x86_64, model RS1522+급, 24/7 어플라이언스
- Docker 24.0.2 (Container Manager) — `docker` 명령은 sudo 필요 추정
- DSM 시스템 Postgres가 `127.0.0.1:5432`/`15432` 가동 중 (SynologyPhotos/synoindex 전용) — **건드리지 않음**, 전용 PG는 별도 컨테이너/포트
- /volume1 20TB 여유 (5% 사용)
- cloudflared 미설치 — 신규 구성 필요
- SSH: `jhkim@192.192.192.145` (sshpass, 비밀번호 인증; SFTP 서브시스템 비활성 → 파일 전송은 ssh 파이프 사용)

## 5. 아키텍처 — NAS Docker Compose (3 서비스)

1. **postgres**: `pgvector/pgvector:pg17` (Neon이 PG17.8이므로 메이저 일치). 데이터 볼륨 `/volume1/Work/kb-chatbot/pgdata`. compose 내부 네트워크 전용(호스트 포트 노출 불필요, 노출 시 DSM 5432와 충돌 없게 5433 등). 자격증명은 NAS `.env`.
2. **app**: Node 22 + Hono(`@hono/node-server`). pnpm 모노레포 빌드. DB 드라이버 `@neondatabase/serverless`→`postgres`(postgres.js)+`drizzle-orm/postgres-js`. compose 네트워크로 `postgres`에 접속(서브-ms).
3. **cloudflared**: Named Tunnel. `kb-api.runvision.ai` → `app:PORT` (HTTP). 아웃바운드 전용(포트포워딩·공인IP 불필요).

## 6. 컴포넌트 설계 / Workers→Node 대체 매핑

| 현재 (Workers) | NAS (Node) 대체 |
|---|---|
| `@neondatabase/serverless` neon-http | `postgres`(postgres.js) + `drizzle-orm/postgres-js`, localhost TCP |
| KV `RATE_LIMIT` | 인메모리 Map (단일 앱 인스턴스, 남용 throttling엔 충분; 재시작 시 카운터 리셋 허용) |
| KV `BLOCKED_TERMS_CACHE` | Postgres `blocked_terms` 직접 조회 + 프로세스 인메모리 캐시(TTL) |
| R2 `IMAGES` | **유지** — 앱이 S3 API로 업로드. 저장된 `pub-...r2.dev` URL 그대로 (재작성 리스크 회피, 업로드는 운영자 전용·드묾) |
| `c.executionCtx.waitUntil` | Node fire-and-forget async (또는 await) |
| `scheduled()` cron | NAS crontab/node-cron. keepalive **폐기**. 마켓플레이스 시간당 동기화만 유지 |
| wrangler secrets | NAS `.env` (git 제외, 600 권한) |
| `wrangler deploy` | `docker compose up -d --build` (NAS) |

드라이버 교체는 drizzle 추상화로 쿼리 코드 대부분 불변. raw `db.execute(sql\`...\`)` 사용처(검색/변형)는 postgres.js 호환 확인 필요.

## 7. 데이터 이전

- **백업 (완료·검증)**: `neon-20260518-1857.dump`(custom 2.5MB) + `.sql`(7.4MB). 로컬 `/Users/jhkim/kb-chatbot-backups/` + NAS `/volume1/Work/kb-chatbot/backups/` (MD5 일치 확인). 8개 테이블 + `vector` 확장 포함. variant 2개 테이블은 Neon에 없었음(정상 — 신규 생성 대상).
- **복원 절차**:
  1. NAS pgvector 컨테이너 기동, 빈 DB 생성.
  2. drizzle 마이그레이션 0000→0001→0002 적용 → 8개 + variant 2개 = 전체 스키마 생성.
  3. 백업에서 **데이터만** 복원 (스키마는 drizzle가 소유): `pg_restore --data-only --disable-triggers` from `neon-20260518-1857.dump` 를 1차 방식으로 사용. 실패 시 plain `.sql`의 `COPY` 구간 수동 적용을 폴백으로. 스키마 충돌 시 drizzle 스키마 우선.
  4. 행수 대조 검증 (knowledge_items 48행 등 소스=타깃).
  5. variant 백필: 기존 published 항목에 `generateAndReplaceQuestionVariants` 실행(이미 구현됨) → "무게는?" 류 recall 개선.

## 8. 컷오버 / 롤백

**컷오버**: ① NAS PG+앱 기동·검증(로컬 카카오 페이로드 모의 테스트) → ② cloudflared 터널 기동, `kb-api.runvision.ai`를 Workers 커스텀도메인에서 분리해 터널로 DNS 재지정 → ③ 실제 카카오 메시지 검증("제품 무게는…" kb_match, "무게는?" variant 매칭) → ④ 안정 확인 후 Neon/Workers 폐기.

다운타임: DNS 전환 순간만. Neon이 이미 에러 상태라 실질 추가 다운타임 최소.

**롤백**: DNS를 Workers 커스텀도메인으로 즉시 원복(이전 Worker는 폐기 전까지 보존). DB 백업은 불변 보관.

## 9. 범위 외 (Out of Scope)

- 대시보드(CF Pages) 이전 — 별도. 단, 대시보드 API 베이스 URL이 `kb-api.runvision.ai`면 자동 승계.
- R2→NAS 이미지 이전 — 보류(현 R2 유지).
- 카카오 콜백/타임아웃 우회 코드 — Approach C에서 동기 경로가 충분히 빨라 불필요(추후 재평가).

## 10. 리스크 / 사용자 액션 의존 / 미해결

- **사용자 액션**: cloudflared 최초 인증(브라우저 로그인 1회) 또는 터널 토큰 발급; `kb-api.runvision.ai`의 Workers 커스텀도메인 해제 + 터널 DNS 지정. (Cloudflare 계정/`runvision.ai` 존 보유 — Workers 커스텀도메인 기존 운영으로 확인됨.)
- **리스크**: NAS Docker `docker` 명령 sudo 권한 필요 여부 → 초기 단계서 확인. postgres.js가 raw SQL/`vector` 캐스팅·variant UNION 쿼리와 호환되는지 검증 필요. NAS 가정용 회선의 인바운드 안정성(cloudflared 아웃바운드라 영향 작음).
- **부수 효과(긍정)**: 마이그레이션 적용으로 그동안 미배포였던 유사질문 시스템이 활성화 → 원래 "무게는?" recall 문제도 함께 해결.

## 11. 검증 기준

- NAS PG에서 `knowledge_items` 48행, variant 테이블 존재 및 백필 완료.
- 카카오 실메시지: "제품 무게는 얼마나 되나요?" → kb_match 빠른 응답, "무게는?" → variant 매칭 또는 빠른 처리, 무응답 없음.
- 콘솔/로그상 Neon 접속 0건, keepalive cron 부재.
