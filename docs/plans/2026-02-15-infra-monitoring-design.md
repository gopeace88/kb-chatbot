# Infrastructure Monitoring Dashboard Design

**Date:** 2026-02-15
**Status:** Approved

## Overview

사이드바에 "인프라 모니터링" 메뉴 추가. `/monitoring` 단일 페이지에서 4개 탭으로 Neon DB, CF Workers, CF Pages, AI Gateway 사용량/비용을 모니터링.

## Requirements

- OpenAI API 사용량 제외, 나머지 인프라 전체 모니터링
- Workers 프록시 방식 (API 키는 Workers secrets에 보관)
- 탭 분리 UI (한 페이지, 4개 탭)
- 수동 새로고침 (페이지 접속 시 + 새로고침 버튼)

## Tab Structure & Data

### Tab 1: Neon DB
- 플랜 정보 (subscription_type), 빌링 주기 (consumption_period)
- Compute: CU-seconds, active time
- Storage: root_branch_bytes_month, child_branch_bytes_month
- Transfer: public_network_transfer_bytes
- 일별 추이 차트 (granularity=daily)
- **APIs:**
  - `GET https://console.neon.tech/api/v2/consumption_history/v2/projects?from=...&to=...&granularity=daily&project_ids=red-heart-96250839`
  - `GET https://console.neon.tech/api/v2/projects/red-heart-96250839`
  - Auth: `Authorization: Bearer <NEON_API_KEY>`

### Tab 2: CF Workers
- 총 요청 수, 에러 수, 에러율
- CPU time (P50, P99)
- 스크립트별 요청 분포
- 일별 추이 차트
- **API:** CF GraphQL `workersInvocationsAdaptive`
  - Account tag: `28b9de8f436a1a7b49eeb39d61b1fefd`
  - Auth: `Authorization: Bearer <CF_API_TOKEN>`

### Tab 3: CF Pages
- 최근 배포 목록 (상태, 시간, 환경)
- Pages Functions 호출 수 (있으면)
- **APIs:**
  - REST: `GET /accounts/{id}/pages/projects/{name}/deployments`
  - GraphQL: `pagesFunctionsInvocationsAdaptiveGroups`

### Tab 4: AI Gateway
- 총 요청 수, 에러 수
- 토큰 사용량 (in/out, cached/uncached)
- 예상 비용 (cost)
- 모델별 분포, 시간별 추이
- **API:** CF GraphQL `aiGatewayRequestsAdaptiveGroups`
  - Gateway ID: `kb-chatbot`

## Architecture

```
Dashboard (Next.js)
  └─ GET /api/monitoring/{service}
      └─ Workers (Hono)
          ├─ /api/monitoring/neon → Neon REST API
          ├─ /api/monitoring/cf-workers → CF GraphQL API
          ├─ /api/monitoring/cf-pages → CF REST API
          └─ /api/monitoring/cf-ai-gateway → CF GraphQL API
```

## New Workers Secrets Required
- `NEON_API_KEY` — Neon API 인증 (Personal API Key)
- `CF_API_TOKEN` — Cloudflare API 토큰 (Account Analytics Read 권한)

## UI Design
- 기존 커스텀 컴포넌트 재활용 (Card, Badge, Button, Select)
- CSS 기반 차트 재활용 (BarChart 패턴)
- 기간 선택: 7일/30일 셀렉터
- 새로고침 버튼 (수동 갱신)
- 로딩 스피너 + 에러 상태 표시
- 사이드바: 기존 "설정" 위에 "인프라 모니터링" 메뉴 추가

## Rate Limits to Respect
- Neon: 700 req/min (general), ~50 req/min (consumption), data updates ~15min
- CF GraphQL: 300 queries/5min
- CF REST: 1200 req/5min
