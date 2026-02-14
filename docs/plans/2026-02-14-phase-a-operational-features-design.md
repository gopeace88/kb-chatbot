# Phase A: 운영 기능 강화 설계

## 목표
지금 바로 구현 가능한 4개 기능을 독립 모듈로 구현하여 운영 효율을 높인다.

## 아키텍처
독립 모듈 방식. 각 기능이 별도 API 엔드포인트 + 대시보드 페이지로 구성. 기능 간 의존성 없음. 공통으로 사용하는 것은 기존 DB 테이블과 API 패턴뿐.

## 기능 목록

### A1. 대시보드 통계 페이지 (#35)
- **Workers API**: `GET /api/stats/overview` — 일별 문의량, 응답 소스 비율, 카테고리 분포
- **Workers API**: `GET /api/stats/top-questions` — 자주 묻는 질문 TOP 10
- **대시보드**: `/stats` 페이지 — recharts 차트 (라인, 파이, 바)
- **데이터 소스**: `conversations` 테이블 집계

### A2. 미답변 질문 수집 → KB 보강 (#36)
- **Workers API**: `GET /api/stats/unanswered` — fallback 응답 대화 목록, 빈도순
- **대시보드**: `/kb/unanswered` 페이지 — 미답변 질문 목록, 유사 질문 그룹핑
- **기능**: 답변 작성 → "KB에 등록" → createKBItem(status: published)
- **데이터 소스**: `conversations` 테이블 WHERE response_source = 'fallback'

### A3. 고객별 대화 이력 (#38)
- **Workers API**: `GET /api/customers/:userId/conversations` — 사용자별 전체 대화
- **대시보드**: 대화 목록에서 사용자 ID 클릭 → `/customers/:id` 타임라인 페이지
- **표시 정보**: 시간, 질문, 답변, 응답 소스 (kb_match/ai/fallback), 이미지 유무

### A4. FAQ 버튼 추천 (신규)
- **Workers API**: `GET /api/kb/popular` — 최근 30일 매칭 빈도 TOP 5 KB 항목
- **카카오 응답**: quickReplies에 인기 질문 버튼 추가
- **함수**: `buildQuickReplies(popularQuestions)` in kakao-response.ts
- **로직**: 답변 후 "다른 질문이 있으신가요?" + 버튼 5개

## Phase B~D 방향 (외부 의존성 해소 후)

### Phase B: 카카오 연동 (심사 완료 후)
- B1 오픈빌더 폴백 블록 → 스킬 URL 연결
- B2 카카오싱크 동의 흐름, customers 테이블에 이름/전화번호
- B3 비즈메시지 알림톡 — 미해결 문의 답변 발송

### Phase C: Cafe24 연동 (가입 후)
- C1 Cafe24 주문/배송 조회 (00.caffe24 API 클라이언트 재사용)
- C2 고객 프로필 통합 (전화번호 기반 매칭)
- C3 상담 화면 사이드 패널

### Phase D: 마켓플레이스 (입점 후)
- D1 쿠팡 문의 수집
- D2 네이버 문의 수집
- 공통 MarketplaceCollector 인터페이스

## 확장성 원칙
1. 채널 추가: CHANNELS 상수에 추가만으로 지원
2. 응답 포맷: 채널별 응답 빌더 분리
3. 멀티 제품: KB에 productId 추가 시 확장 가능 (현재 불필요)
4. API 일관성: { data, error } 응답 형식 통일
